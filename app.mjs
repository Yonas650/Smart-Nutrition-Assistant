import './config.mjs';
import express from 'express';
import { User, Meal } from './db.mjs';
import dotenv from 'dotenv';
import session from 'express-session';
import passport from 'passport';
import flash from 'express-flash'; //express-flash for flash messages
import { engine } from 'express-handlebars';
import moment from 'moment';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import axios from 'axios';
import fs from 'fs/promises';
import multer from 'multer';
import { getUserDietaryTrends } from './userActions.mjs'; 
import NutritionAPI from './api.mjs';
import bcrypt from 'bcryptjs';

//const readFileAsync = util.promisify(fs.readFile);
// Import custom modules
import { connectDB } from './db.mjs';
import { initializePassport, checkAuthenticated, checkNotAuthenticated, registerUser } from './auth.mjs';

//set up multer for file uploads
const upload = multer({ dest: 'uploads/' });

dotenv.config();
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

//database connection
connectDB();

//view engine setup
const hbs = engine({
  defaultLayout: 'main',
  extname: '.hbs',
  layoutsDir: join(__dirname, 'views', 'layouts'),
  helpers: {
    json: function (context) {
      return JSON.stringify(context);
    },
    dateFormat: function (date, format = "MMMM Do YYYY, h:mm:ss a") {
      //default format includes date and time
      return moment(date).format(format);
  },
    gt: function(value1, value2) {
      return value1 > value2;
    },
    eq: function(arg1, arg2) {
      return arg1 === arg2;
    },
    multiply: function(arg1, arg2) {
      return arg1 * arg2;
    },
    subtract: function(arg1, arg2) {
      return arg1 - arg2;
    }
},
  runtimeOptions: {
    allowProtoPropertiesByDefault: true,
    allowProtoMethodsByDefault: true,
  },
});

app.engine('hbs', hbs);
app.set('view engine', 'hbs');
app.set('views', join(__dirname, 'views'));


//middleware
app.use(express.static(join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());

//initialize authentication strategies
initializePassport(passport);

//routes
app.get('/', (req, res) => res.render('home'));
app.get('/login', checkNotAuthenticated, (req, res) => res.render('login'));
app.get('/register', checkNotAuthenticated, (req, res) => res.render('register'));
//app.get('/dashboard', checkAuthenticated, (req, res) => res.render('dashboard', { user: req.user }));

//registration handler
app.post('/register', checkNotAuthenticated, async (req, res) => {
  const { email, password, username } = req.body;
  console.log("Attempting to register user:", email);
  try {
    await registerUser(email, password, username);
    console.log("User registered successfully");
    req.flash('success_msg', 'You are now registered and can log in');
    res.redirect('/login');
  } catch (error) {
    console.error("Error registering user:", error);
    req.flash('error_msg', 'Error registering the user: ' + error.message);
    res.redirect('/register');
  }
});

app.get('/dashboard', checkAuthenticated, async (req, res) => {
  try {
    const meals = await Meal.find({ userId: req.user._id }).sort({ date: -1 });
    let apiResponseFlash = req.flash('apiResponse');
    let apiResponse = apiResponseFlash.length ? JSON.parse(apiResponseFlash[0]) : null;

    res.render('dashboard', {
      user: req.user,
      meals: meals,
      apiResponse: apiResponse,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (error) {
    console.error('Error fetching meals:', error);
    res.render('dashboard', {
      user: req.user,
      meals: [],
      error_msg: 'Failed to fetch meals.'
    });
  }
});




//upload meal image and process it through GPT-4 Vision API
app.post('/upload-meal', checkAuthenticated, upload.single('mealImage'), async (req, res) => {
  if (!req.file) {
      req.flash('error_msg', 'No file uploaded.');
      return res.redirect('/dashboard');
  }

  try {
      const imageBuffer = await fs.readFile(req.file.path);
      const base64Image = await NutritionAPI.encodeImageToBase64(imageBuffer);
      const apiResponse = await NutritionAPI.callGPT4VisionAPI(base64Image);

      //remove markdown code block syntax if present
      let content = apiResponse.choices[0].message.content;
      content = content.replace(/(```json|```)/g, ''); //this regex targets markdown code

      //parse the JSON
      const parsedData = JSON.parse(content);

      const newMeal = new Meal({
          userId: req.user._id,
          date: new Date(),
          items: parsedData.items,
          totalCalories: parsedData.totalCalories
      });
      await newMeal.save();
      req.flash('success_msg', 'Meal uploaded and analyzed successfully.');
      res.redirect('/dashboard');
  } catch (error) {
      console.error('Failed to process image:', error);
      await fs.unlink(req.file.path);
      req.flash('error_msg', 'Failed to process your image: ' + error.message);
      res.redirect('/dashboard');
  }
});





//route to display form for setting dietary goals
app.get('/set-dietary-goals', checkAuthenticated, (req, res) => {
  res.render('set-dietary-goals', { user: req.user });
});

//route to process form submission for setting dietary goals
app.post('/set-dietary-goals', checkAuthenticated, async (req, res) => {
  const { dailyCalorieIntake, carbs, proteins, fats, dietaryPreferences } = req.body;
  const totalMacros = parseInt(carbs, 10) + parseInt(proteins, 10) + parseInt(fats, 10);

  if (totalMacros !== 100) {
      req.flash('error_msg', 'The sum of macronutrients distribution must equal 100%.');
      return res.redirect('/set-dietary-goals');
  }

  try {
      await User.updateOne({ _id: req.user._id }, {
          $set: {
              'dietaryGoals.dailyCalorieIntake': dailyCalorieIntake,
              'dietaryGoals.macronutrients': { carbs, proteins, fats },
              'dietaryGoals.dietaryPreferences': dietaryPreferences,
          }
      });
      req.flash('success_msg', 'Dietary goals updated successfully.');
      res.redirect('/dashboard');
  } catch (error) {
      console.error('Error updating dietary goals:', error);
      req.flash('error_msg', 'Failed to update dietary goals.');
      res.redirect('/set-dietary-goals');
  }
});

//test function for trend data
/*const insertTestData = async (userId) => {
 
  const now = new Date();

  //insert daily data for the past month
  for (let i = 30; i > 0; i--) {
    const testDate = new Date(now);
    testDate.setDate(now.getDate() - i);

    const testData = new Meal({
      userId: userId,
      date: testDate,
      items: [{ name: 'Test Food', carbs: 50, protein: 25, fats: 10, calories: 450 }],
      totalCalories: 450 //this should be the sum of the calories from items
    });

    await testData.save();
  }
};

//calling the func with user ID
insertTestData('660a991599b1d0f85c208458');
*/

app.get('/dietary-trends', checkAuthenticated, async (req, res) => {
  //get the timeframe from the query string or default to 'weekly'
  const timeframe = req.query.timeframe || 'weekly';
  
  //calculate the start date based on the selected timeframe
  const startDate = new Date();
  if (timeframe === 'weekly') {
    startDate.setDate(startDate.getDate() - 7);
  } else if (timeframe === 'monthly') {
    startDate.setMonth(startDate.getMonth() - 1);
  } else {
    startDate.setDate(startDate.getDate() - 1); //for 'daily', it will fetch today's data
  }

  try {
    const meals = await Meal.find({
      userId: req.user._id,
      date: { $gte: startDate }
    }).sort({ date: 1 });

    //process meals to extract the trend data
    const labels = [];
    const data = [];
    meals.forEach(meal => {
      const dateLabel = meal.date.toISOString().split('T')[0]; //YYYY-MM-DD format
      labels.push(dateLabel);
      data.push(meal.calories);
    });

    //render the dietary-trends template with the data
    res.render('dietary-trends', { 
      labels: JSON.stringify(labels),
      data: JSON.stringify(data)
    });
  } catch (error) {
    console.error('Error fetching dietary trends:', error);
    res.status(500).send('Server error');
  }
});


//helper function to calculate the start of the week, month, etc.
function getStartDate(timeframe) {
  const now = new Date();
  now.setHours(0, 0, 0, 0); //start of the day

  switch (timeframe) {
    case 'weekly':
      const dayOfWeek = now.getDay();
      now.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)); //last Monday
      break;
    case 'monthly':
      now.setDate(1); //first day of the current month
      break;
    case 'daily':
    default:
      //today is already set by default
      break;
  }

  return now;
}

app.get('/dietary-trends-data', checkAuthenticated, async (req, res) => {
  const { timeframe } = req.query; //timeframe can be 'daily', 'weekly', or 'monthly'
  const startDate = getStartDate(timeframe);

  try {
    //find all meals from startDate to now
    const meals = await Meal.find({
      userId: req.user._id,
      date: { $gte: startDate }
    }).sort('date');

    //process the meals to fit the chart data structure
    const labels = []; //for storing dates
    const data = []; //for storing calories values

    meals.forEach(meal => {
      labels.push(meal.date.toISOString().split('T')[0]); //convert date to YYYY-MM-DD format
      data.push(meal.totalCalories);
    });

    //send this data as JSON to the frontend
    res.json({ labels, data });
  } catch (error) {
    console.error('Error fetching dietary trends:', error);
    res.status(500).send('Server error');
  }
});




//update account info
app.get('/account-settings', checkAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.render('account-settings', { user });
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.redirect('/dashboard');
  }
});

app.post('/update-account', checkAuthenticated, async (req, res) => {
  const { name, email, currentPassword, newPassword } = req.body;

  try {
    const user = await User.findById(req.user._id);

    //check if currentPassword matches user's current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      req.flash('error_msg', 'Current password is incorrect.');
      return res.redirect('/account-settings');
    }

    //update user's information
    if (name) user.username = name;
    if (email) user.email = email;
    if (newPassword) {
      user.password = await bcrypt.hash(newPassword, 10); //Hash new password
    }
    
    
    await user.save();

    req.flash('success_msg', 'Account information updated successfully.');
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Error updating account:', error);
    req.flash('error_msg', 'Failed to update account information.');
    res.redirect('/account-settings');
  }
});

//route to fetch dietary progress and advice
app.get('/dietary-progress', checkAuthenticated, async (req, res) => {
  res.render('dietary-progress', { user: req.user });
});

app.post('/get-dietary-advice', checkAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      throw new Error('User not found');
    }
    const userGoals = user.dietaryGoals;
    const dietaryTrends = await getUserDietaryTrends(req.user._id); //assuming this function exists and fetches trends data
    const advice = await NutritionAPI.getDietaryAdvice(userGoals, dietaryTrends);

    res.json({ advice });
  } catch (error) {
    console.error(`Error getting dietary advice: ${error.message}`);
    res.status(500).json({ error: 'Failed to get dietary advice' });
  }
});



//login handler
app.post('/login', checkNotAuthenticated, passport.authenticate('local', {
  successRedirect: '/dashboard',
  failureRedirect: '/login',
  failureFlash: true
}));

//logout handler
app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) { return next(err); }
    res.redirect('/login');
  });
});

//starting the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

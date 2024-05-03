import './config.mjs';
import express from 'express';
import dotenv from 'dotenv';
import session from 'express-session';
import passport from 'passport';
import flash from 'express-flash';
import { engine } from 'express-handlebars';
import moment from 'moment';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import multer from 'multer';
import NutritionAPI from './api.mjs';
import { connectDB } from './db.mjs';
import { User, Meal } from './db.mjs';

import { initializePassport, checkAuthenticated, checkNotAuthenticated } from './auth.mjs';
import { UserController, MealController, DietaryGoalsController, DietaryTrendsController } from './userActions.mjs';

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
    isActive: function (link, currentUrl) {
      return link === currentUrl ? 'active' : '';
    },
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

//registration handler
app.post('/register', checkNotAuthenticated, async (req, res) => {
  const { email, password, username } = req.body;
  try {
    await UserController.registerUser(email, password, username);
    req.flash('success_msg', 'You are now registered and can log in');
    res.redirect('/login');
  } catch (error) {
    req.flash('error_msg', 'Error registering the user: ' + error.message);
    res.redirect('/register');
  }
});
app.get('/account-settings', checkAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.render('account-settings', { user });
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.redirect('/dashboard');
  }
});

//update account info
app.post('/update-account', checkAuthenticated, async (req, res) => {
  const { name, email, currentPassword, newPassword } = req.body;
  try {
    await UserController.updateUserInfo(req.user._id, { name, email, currentPassword, newPassword });
    req.flash('success_msg', 'Account information updated successfully.');
    res.redirect('/dashboard');
  } catch (error) {
    req.flash('error_msg', error.message);
    res.redirect('/account-settings');
  }
});

//dashboard
app.get('/dashboard', checkAuthenticated, async (req, res) => {
  try {
    const meals = await MealController.getMealsByUser(req.user._id);
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

      let content = apiResponse.choices[0].message.content;
      content = content.replace(/(```json|```)/g, '');

      const parsedData = JSON.parse(content);

      await MealController.uploadMeal(req.user._id, base64Image, parsedData);
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
    await DietaryGoalsController.setDietaryGoals(req.user._id, dailyCalorieIntake, { carbs, proteins, fats }, dietaryPreferences);
    req.flash('success_msg', 'Dietary goals updated successfully.');
    res.redirect('/dashboard');
  } catch (error) {
    req.flash('error_msg', 'Failed to update dietary goals.');
    res.redirect('/set-dietary-goals');
  }
});

//helper function to calculate the start of the week, month, etc.
function getStartDate(timeframe) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  switch (timeframe) {
    case 'weekly':
      const dayOfWeek = now.getDay();
      now.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
     
      now.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)); //last Monday
      break;
    case 'monthly':
      now.setDate(1); //first day of the current month
      break;
    case 'daily':
    default:
      break; //today is already set by default
  }

  return now;
}

//dietary trends route
app.get('/dietary-trends', checkAuthenticated, async (req, res) => {
  const timeframe = req.query.timeframe || 'weekly';
  const startDate = getStartDate(timeframe);

  try {
    const meals = await DietaryTrendsController.getDietaryTrends(req.user._id, startDate);
    const labels = [];
    const data = [];

    meals.forEach(meal => {
      const dateLabel = meal.date.toISOString().split('T')[0];
      labels.push(dateLabel);
      data.push(meal.totalCalories);
    });

    res.render('dietary-trends', {
      labels: JSON.stringify(labels),
      data: JSON.stringify(data),
      user: req.user //pass the user data to the view
    });
  } catch (error) {
    console.error('Error fetching dietary trends:', error);
    res.status(500).send('Server error');
  }
});



//dietary trends data route
app.get('/dietary-trends-data', checkAuthenticated, async (req, res) => {
  const { timeframe } = req.query;
  const startDate = getStartDate(timeframe);
  
  try {
    const meals = await Meal.find({
      userId: req.user._id,
      date: { $gte: startDate }
    }).sort('date');
    
    //check the retrieved data here
    console.log('Meals:', meals);
    
    const labels = [];
    const data = [];

    meals.forEach(meal => {
      labels.push(meal.date.toISOString().split('T')[0]);
      data.push(meal.totalCalories);
    });
    
    //send the data to the client-side
    res.json({ labels, data });
  } catch (error) {
    console.error('Error fetching dietary trends:', error);
    res.status(500).send('Server error');
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
    const dietaryTrends = await DietaryTrendsController.getDietaryTrends(req.user._id, new Date()); //this function fetches trends data
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
    if (err) {
      return next(err);
    }
    res.redirect('/login');
  });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

//MongoDB Connection
export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, { //use MONGODB_URI
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

//User Model
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  dietaryGoals: { type: Object, default: {} },
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);

//Meal Model
const mealSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, default: Date.now },
  items: [{
    name: String,
    carbs: Number,
    protein: Number,
    fats: Number,
    calories: Number,
  }],
  totalCalories: Number,
}, { timestamps: true });

export const Meal = mongoose.model('Meal', mealSchema);

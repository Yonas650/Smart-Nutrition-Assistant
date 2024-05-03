// userActions.mjs

import { User, Meal } from './db.mjs';
import bcrypt from 'bcryptjs';

export class UserController {
  static async registerUser(email, password, username) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword, username });
    await user.save();
  }

  static async updateUserInfo(userId, { name, email, currentPassword, newPassword }) {
    const user = await User.findById(userId);

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) throw new Error('Current password is incorrect');

    if (name) user.username = name;
    if (email) user.email = email;
    if (newPassword) user.password = await bcrypt.hash(newPassword, 10);

    await user.save();
  }
}

export class MealController {
  static async getMealsByUser(userId) {
    return await Meal.find({ userId }).sort({ date: -1 });
  }

  static async uploadMeal(userId, base64Image, parsedData) {
    const newMeal = new Meal({
      userId,
      date: new Date(),
      items: parsedData.items,
      totalCalories: parsedData.totalCalories,
    });
    await newMeal.save();
  }
}

export class DietaryGoalsController {
  static async setDietaryGoals(userId, dailyCalorieIntake, macronutrients, dietaryPreferences) {
    await User.updateOne({ _id: userId }, {
      $set: {
        'dietaryGoals.dailyCalorieIntake': dailyCalorieIntake,
        'dietaryGoals.macronutrients': macronutrients,
        'dietaryGoals.dietaryPreferences': dietaryPreferences,
      }
    });
  }
}

export class DietaryTrendsController {
  static async getDietaryTrends(userId, startDate) {
    return await Meal.find({
      userId,
      date: { $gte: startDate }
    }).sort({ date: 1 });
  }
}

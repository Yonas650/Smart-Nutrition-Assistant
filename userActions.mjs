import { User, Meal } from './db.mjs';

/**
 *updates user account information.
 */
export const updateUserAccount = async (userId, updates) => {
  try {
    const user = await User.findByIdAndUpdate(userId, updates, { new: true });
    return user;
  } catch (error) {
    console.error('Error updating user account:', error);
    throw error;
  }
};

/**
 *sets or updates dietary goals for a user.
 */
export const setDietaryGoals = async (userId, dietaryGoals) => {
  try {
    const user = await User.findByIdAndUpdate(userId, { dietaryGoals }, { new: true });
    return user;
  } catch (error) {
    console.error('Error setting dietary goals:', error);
    throw error;
  }
};

/**
 *retrieves dietary goals for a user.
 */
export const getDietaryGoals = async (userId) => {
  try {
    const user = await User.findById(userId);
    return user.dietaryGoals;
  } catch (error) {
    console.error('Error retrieving dietary goals:', error);
    throw error;
  }
};

/**
 *aggregates meal data for a user over a specified period to compute dietary trends.
 */

/**
 *retrieves dietary trends for a given user.
 * @param {mongoose.Types.ObjectId} userId -the user's ID.
 * @returns {Promise<Object>}an object containing trend data.
 */
export async function getUserDietaryTrends(userId) {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - 1); //last month

  try {
    const meals = await Meal.find({
      userId: userId,
      date: { $gte: startDate, $lte: endDate }
    }).sort('date');

    //aggregate data for trends
    const trends = meals.reduce((acc, meal) => {
      const dateStr = meal.date.toISOString().split('T')[0];
      if (!acc[dateStr]) {
        acc[dateStr] = { totalCalories: 0, items: [] };
      }
      acc[dateStr].totalCalories += meal.totalCalories;
      acc[dateStr].items.push(...meal.items);
      return acc;
    }, {});

    return trends;
  } catch (error) {
    console.error(`Error fetching dietary trends for user ${userId}: ${error.message}`);
    throw error;
  }
}

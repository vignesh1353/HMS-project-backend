const Notification = require('../models/Notification');

/**
 * Dispatches an in-app notification to a user or role
 * @param {Object} data
 * @param {string} [data.recipient] - User ObjectId
 * @param {string} [data.recipientRole] - 'admin' | 'patient' | 'doctor' | 'staff' | 'all'
 * @param {string} data.type - Event type
 * @param {string} data.title - Notification headline
 * @param {string} data.message - Notification description
 * @param {string} [data.relatedEntity] - Entity name
 * @param {string} [data.relatedEntityId] - Entity ID
 */
const createNotification = async ({
  recipient,
  recipientRole = 'admin',
  type,
  title,
  message,
  relatedEntity = '',
  relatedEntityId = '',
}) => {
  try {
    const notification = await Notification.create({
      recipient,
      recipientRole,
      type,
      title,
      message,
      relatedEntity,
      relatedEntityId,
    });
    return notification;
  } catch (error) {
    console.error('Notification dispatch error (non-fatal):', error.message);
    return null;
  }
};

module.exports = {
  createNotification,
};

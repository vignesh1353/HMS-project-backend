const Notification = require('../models/Notification');

// @desc    Get user notifications (filtered by user id or admin role broadcast)
// @route   GET /api/notifications
// @access  Private
const getNotifications = async (req, res, next) => {
  try {
    const query = {};

    if (req.user.role === 'admin') {
      // Admins see notifications intended for their user ID or broadcast to 'admin'/'all'
      query.$or = [
        { recipient: req.user.id },
        { recipientRole: 'admin' },
        { recipientRole: 'all' },
      ];
    } else {
      // Other roles see notifications for their specific user ID or role broadcast
      query.$or = [
        { recipient: req.user.id },
        { recipientRole: req.user.role },
        { recipientRole: 'all' },
      ];
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      ...query,
      read: false,
    });

    res.status(200).json({
      success: true,
      count: notifications.length,
      unreadCount,
      data: notifications,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private
const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findByIdAndUpdate(
      id,
      { read: true, readAt: new Date() },
      { returnDocument: 'after' }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: `Notification not found with ID ${id}`,
      });
    }

    res.status(200).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark all notifications as read
// @route   PATCH /api/notifications/read-all
// @access  Private
const markAllAsRead = async (req, res, next) => {
  try {
    const query = {};
    if (req.user.role === 'admin') {
      query.$or = [
        { recipient: req.user.id },
        { recipientRole: 'admin' },
        { recipientRole: 'all' },
      ];
    } else {
      query.$or = [
        { recipient: req.user.id },
        { recipientRole: req.user.role },
        { recipientRole: 'all' },
      ];
    }

    await Notification.updateMany(query, {
      read: true,
      readAt: new Date(),
    });

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
};

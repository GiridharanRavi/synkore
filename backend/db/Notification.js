const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  stage: { 
    type: String, 
    required: true // e.g., 'Stage 1: Sample Request', 'Stage 3: Inward Fabric'
  },
  action: { 
    type: String, 
    required: true // e.g., 'Created', 'Updated/Edited'
  },
  message: { 
    type: String, 
    required: true // e.g., 'New Sample Request generated for Order #102'
  },
  isRead: { 
    type: Boolean, 
    default: false 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('Notification', NotificationSchema);
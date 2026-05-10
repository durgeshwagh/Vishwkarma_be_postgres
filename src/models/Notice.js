const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Notice = sequelize.define('Notice', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    fileUrl: {
        type: DataTypes.STRING,
        field: 'file_url'
    },
    fileId: {
        type: DataTypes.STRING,
        field: 'file_id'
    },
    type: {
        type: DataTypes.ENUM('General', 'Event', 'Urgent'),
        defaultValue: 'General'
    },
    target: {
        type: DataTypes.ENUM('All', 'Selected'),
        defaultValue: 'All'
    },
    recipients: {
        type: DataTypes.JSONB, // Array of Member IDs
        defaultValue: []
    },
    readBy: {
        type: DataTypes.JSONB, // Array of User IDs
        defaultValue: []
    },
    createdBy: {
        type: DataTypes.UUID,
        field: 'created_by'
    }
}, {
    tableName: 'notices',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['created_at'] },
        { fields: ['type', 'created_at'] },
        { fields: ['target', 'created_at'] }
    ]
});

module.exports = Notice;

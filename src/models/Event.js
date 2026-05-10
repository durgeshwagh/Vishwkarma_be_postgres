const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Event = sequelize.define('Event', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false
    },
    date: {
        type: DataTypes.DATE,
        allowNull: false
    },
    location: {
        type: DataTypes.STRING,
        allowNull: false
    },
    description: {
        type: DataTypes.TEXT
    },
    imageUrl: {
        type: DataTypes.STRING,
        field: 'image_url'
    },
    imageId: {
        type: DataTypes.STRING,
        field: 'image_id'
    },
    videoUrl: {
        type: DataTypes.STRING,
        field: 'video_url'
    },
    videoId: {
        type: DataTypes.STRING,
        field: 'video_id'
    },
    mediaType: {
        type: DataTypes.ENUM('Image', 'Video'),
        defaultValue: 'Image',
        field: 'media_type'
    },
    organizer: {
        type: DataTypes.STRING
    }
}, {
    tableName: 'events',
    timestamps: true,
    underscored: true
});

module.exports = Event;

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Donation = sequelize.define('Donation', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    memberId: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'member_id'
    },
    memberName: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'member_name'
    },
    amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    date: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    type: {
        type: DataTypes.ENUM('General', 'Event', 'Temple', 'Education'),
        defaultValue: 'General'
    },
    notes: {
        type: DataTypes.TEXT
    }
}, {
    tableName: 'donations',
    timestamps: true,
    underscored: true
});

module.exports = Donation;

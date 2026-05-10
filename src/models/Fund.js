const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Fund = sequelize.define('Fund', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    memberId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'member_id'
    },
    amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    type: {
        type: DataTypes.ENUM('General', 'Temple', 'Education', 'Event'),
        allowNull: false
    },
    date: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    description: {
        type: DataTypes.TEXT
    },
    createdBy: {
        type: DataTypes.UUID,
        field: 'created_by'
    }
}, {
    tableName: 'funds',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['date'] },
        { fields: ['type', 'date'] },
        { fields: ['member_id'] }
    ]
});

module.exports = Fund;

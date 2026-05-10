const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const BoardMember = sequelize.define('BoardMember', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    year: {
        type: DataTypes.STRING,
        allowNull: false
    },
    role: {
        type: DataTypes.STRING,
        allowNull: false
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    description: {
        type: DataTypes.TEXT
    },
    memberId: {
        type: DataTypes.STRING,
        field: 'member_id'
    },
    photoUrl: {
        type: DataTypes.STRING,
        field: 'photo_url'
    },
    photoId: {
        type: DataTypes.STRING,
        field: 'photo_id'
    },
    contact: {
        type: DataTypes.STRING
    },
    city: {
        type: DataTypes.STRING
    },
    createdBy: {
        type: DataTypes.UUID,
        field: 'created_by'
    }
}, {
    tableName: 'board_members',
    timestamps: true,
    underscored: true
});

module.exports = BoardMember;

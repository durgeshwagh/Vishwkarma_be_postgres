const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Marriage = sequelize.define('Marriage', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    husbandId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'husband_id'
    },
    wifeId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'wife_id'
    },
    marriageDate: {
        type: DataTypes.DATE,
        field: 'marriage_date'
    },
    status: {
        type: DataTypes.ENUM('Active', 'Divorced', 'Widowed'),
        defaultValue: 'Active'
    }
}, {
    tableName: 'marriages',
    timestamps: true,
    underscored: true,
    indexes: [
        {
            unique: true,
            fields: ['husband_id', 'wife_id']
        }
    ]
});

module.exports = Marriage;

const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/community_app_db', {
  dialect: 'postgres',
  logging: false, // Set to console.log to see SQL queries
  define: {
    timestamps: true,
    underscored: true // Use snake_case for database columns
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

module.exports = sequelize;

const express = require('express');
// Trigger restart for auth changes
const sequelize = require('./src/config/database');
require('./src/models'); // Load all models and associations
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();



const authRoutes = require('./src/routes/auth');
const memberRoutes = require('./src/routes/members');
const fundRoutes = require('./src/routes/funds');
const eventRoutes = require('./src/routes/events');
const donationRoutes = require('./src/routes/donations');
const noticeRoutes = require('./src/routes/notices');
const boardRoutes = require('./src/routes/board');
const familyRoutes = require('./src/routes/family');
const adminRoutes = require('./src/routes/admin');
const locationRoutes = require('./src/routes/locations');
const unionRoutes = require('./src/routes/unions'); // NEW: Union routes
const utilRoutes = require('./src/routes/utils');

const app = express();
const PORT = process.env.PORT || 3000;
// MONGO_URI removed, using DATABASE_URL from .env

const compression = require('compression');
const helmet = require('helmet');

// Middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Global Middleware for CORP & Cache Control
app.use((req, res, next) => {
    res.header("Cross-Origin-Resource-Policy", "cross-origin");
    
    // Disable Caching for API responses
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    next();
});

app.use(compression());
app.use(cors({
    origin: ['http://localhost:4200', 'http://localhost:8100',
        'http://localhost:8080','https://www.vishwasetu.co.in'],
    credentials: true
}));

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Swagger Configuration
// Swagger Configuration
// Swagger Configuration
const swaggerJsdoc = require('swagger-jsdoc');

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Community App API',
            version: '1.0.0',
            description: 'API Documentation for Community Management Application',
        },
        servers: [
            {
                url: 'http://localhost:3000',
            },
            {
                url: 'https://api.vishwasetu.co.in',
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
        security: [
            {
                bearerAuth: [],
            },
        ],
    },
    apis: ['./src/routes/*.js'], // Path to the API docs
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);

app.get('/docs', (req, res) => {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Community App API Docs</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui.min.css" />
    <style>
        html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
        *, *:before, *:after { box-sizing: inherit; }
        body { margin: 0; background: #fafafa; }
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui-bundle.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui-standalone-preset.min.js"></script>
    <script>
        window.onload = function() {
            const ui = SwaggerUIBundle({
                spec: ${JSON.stringify(swaggerDocs)},
                dom_id: '#swagger-ui',
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                layout: "StandaloneLayout",
            });
        };
    </script>
</body>
</html>`;
    res.send(html);
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/funds', fundRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/donations', donationRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/board', boardRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/unions', unionRoutes); // NEW: Union routes
app.use('/api/utils', utilRoutes);
app.use('/uploads', express.static('uploads', {
    setHeaders: (res, path, stat) => {
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    }
}));

app.get('/', (req, res) => {
    res.send('Backend Modified: 2026-02-14 23:40 GMT (Dual Login Ready)');
});

// Database Connection & Server Start
sequelize.authenticate()
    .then(() => {
        console.log('PostgreSQL Connected');
        // sync({ alter: true }) will update the schema to match the models
        return sequelize.sync({ alter: true });
    })
    .then(() => {
        console.log('Database Synced');
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch(err => {
        console.error('PostgreSQL Connection Failed:', err.message);
        process.exit(1);
    });

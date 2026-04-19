const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Load English location data
const LOCATIONS_DATA_PATH = path.join(__dirname, '../data/indian_locations.json');
let indianLocations = [];

try {
    if (fs.existsSync(LOCATIONS_DATA_PATH)) {
        indianLocations = JSON.parse(fs.readFileSync(LOCATIONS_DATA_PATH, 'utf8'));
    }
} catch (error) {
    console.error('Error loading location data:', error);
}

// Hardcoded fallback states for safety (if JSON is missing)
const FALLBACK_STATES = [
    "Andaman & Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
    "Chandigarh", "Chhattisgarh", "Dadra & Nagar Haveli", "Daman & Diu", "Delhi",
    "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu & Kashmir", "Jharkhand",
    "Karnataka", "Kerala", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur",
    "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan",
    "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

/**
 * @swagger
 * /api/locations/states:
 *   get:
 *     summary: Get all states
 *     tags: [Locations]
 */
router.get('/states', (req, res) => {
    let source = indianLocations;
    
    // Fallback if JSON file is missing or empty
    if (source.length === 0) {
        console.warn('Location JSON missing or empty, using hardcoded state fallback');
        return res.json(FALLBACK_STATES.map(s => ({
            id: s,
            code: s,
            name: s
        })));
    }

    const states = source.map((s, index) => ({
        id: s.state,
        code: s.code || s.state,
        name: s.state
    }));
    res.json(states);
});

/**
 * @swagger
 * /api/locations/districts:
 *   get:
 *     summary: Get districts by state
 *     tags: [Locations]
 */
router.get('/districts', (req, res) => {
    const stateId = req.query.state_id || req.query.state_code;
    const state = indianLocations.find(s => s.state === stateId || s.code === stateId);
    
    if (!state) return res.json([]);
    
    const districts = state.districts.map(d => ({
        id: d.district,
        code: d.district,
        name: d.district
    }));
    res.json(districts);
});

/**
 * @swagger
 * /api/locations/talukas:
 *   get:
 *     summary: Get talukas by district
 *     tags: [Locations]
 */
router.get('/talukas', (req, res) => {
    const districtId = req.query.district_id || req.query.district_code;
    
    let subDistricts = [];
    for (const state of indianLocations) {
        const district = state.districts.find(d => d.district === districtId);
        if (district) {
            subDistricts = (district.subDistricts || []).map(sd => ({
                id: sd.subDistrict,
                code: sd.subDistrict,
                name: sd.subDistrict
            }));
            break;
        }
    }
    res.json(subDistricts);
});

/**
 * @swagger
 * /api/locations/villages:
 *   get:
 *     summary: Get villages by taluka
 *     tags: [Locations]
 */
router.get('/villages', (req, res) => {
    const talukaName = req.query.taluka || req.query.taluka_code;
    
    let villages = [];
    for (const state of indianLocations) {
        for (const district of state.districts) {
            const subDist = (district.subDistricts || []).find(sd => sd.subDistrict === talukaName);
            if (subDist && subDist.villages) {
                villages = subDist.villages.map(v => ({
                    id: v,
                    code: v,
                    name: v
                }));
                break;
            }
        }
        if (villages.length > 0) break;
    }
    res.json(villages);
});

module.exports = router;

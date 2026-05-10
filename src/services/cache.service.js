/**
 * Cache Service using node-cache
 * Provides in-memory caching for frequently accessed data
 */
const NodeCache = require('node-cache');

// TTL: 5 minutes (300 seconds), check period: 2 minutes
const cache = new NodeCache({ stdTTL: 300, checkperiod: 120 });

const CACHE_KEYS = {
    DASHBOARD_STATS: 'dashboard_stats'
};

module.exports = {
    get: (key) => {
        const value = cache.get(key);
        if (value) {
            console.log(`[Cache HIT] ${key}`);
        } else {
            console.log(`[Cache MISS] ${key}`);
        }
        return value;
    },

    set: (key, value, ttl = 300) => {
        cache.set(key, value, ttl);
        console.log(`[Cache SET] ${key} (TTL: ${ttl}s)`);
        return true;
    },

    del: (key) => {
        cache.del(key);
        console.log(`[Cache DEL] ${key}`);
    },

    flush: () => {
        cache.flushAll();
        console.log('[Cache] Flushed all cache');
    },

    invalidateDashboard: () => {
        cache.del(CACHE_KEYS.DASHBOARD_STATS);
        console.log('[Cache] Dashboard stats invalidated');
    },

    KEYS: CACHE_KEYS
};

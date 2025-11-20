// file: authMiddleware.js

const jwt = require('jsonwebtoken');
// Pastiin JWT_SECRET-nya sama persis kayak di index.js
const JWT_SECRET = 'rahasia-banget-ini-jangan-disebar'; 

/**
 * Ini adalah 'curried function'
 * Dia nerima 'requiredRole' (misal 'operator' atau 'orangtua')
 * dan ngembaliin fungsi middleware (req, res, next)
 */
const authenticateToken = (requiredRole) => (req, res, next) => {
    
    // 1. Ambil token dari header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"
    
    if (token == null) {
        return res.status(401).send({ message: 'Token tidak ada.' }); // 401 Unauthorized
    }

    // 2. Verifikasi token-nya
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).send({ message: 'Token tidak valid.' }); // 403 Forbidden
        }

        // 3. Cek Role (INI BAGIAN PENTING)
        // 'user' adalah isi token (cth: { id_orang_tua: ..., role: 'orangtua' })
        
        // Kalo endpoint-nya butuh role spesifik (misal 'operator' atau 'orangtua')
        if (requiredRole) {
            
            // Cek apakah role di token sama kayak role yang dibutuhin
            if (user.role !== requiredRole) {
                // Kalo nggak sama, TOLAK
                return res.status(403).send({ 
                    message: `Akses ditolak. Anda butuh hak '${requiredRole}', tapi Anda punya hak '${user.role}'.` 
                });
            }
        }
        // Kalo endpoint-nya nggak butuh role spesifik (cth: `authenticateToken()` aja)
        // dia bakal lolos (karena 'requiredRole' itu 'undefined')
        
        // 4. Lolos! Lanjut ke API
        req.user = user; // Simpen data user di 'req' biar bisa dipake API
        next();
    });
};

module.exports = authenticateToken;
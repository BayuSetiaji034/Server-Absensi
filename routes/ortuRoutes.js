// src/routes/ortuRoutes.js

const express = require('express');
const router = express.Router();
const authenticateToken = require('../authMiddleware');

// Impor semua "Pekerja" dari controller
const {
    loginOrtu,
    getLaporanSaya,
    searchOrtu,
    getAllOrtu,
    gantiPasswordOrtu,
    updateOrtu,
    resetPasswordOrtu,
    deleteOrtu,
    lupaPasswordOrtu
} = require('../controllers/ortuController');

// Definisikan semua URL yang diurus manajer ini
// (Perhatiin, /api/orangtua udah diurus 'index.js')

// POST /api/orangtua/login
router.post('/login', loginOrtu);

// GET /api/orangtua/laporan-saya
router.get('/laporan-saya', authenticateToken('orangtua'), getLaporanSaya);

// GET /api/orangtua/search
router.get('/search', authenticateToken('operator'), searchOrtu);

// GET /api/orangtua/
router.get('/', authenticateToken('operator'), getAllOrtu);

// PUT /api/orangtua/ganti-password
// (Harus di atas /:id)
router.put('/ganti-password', authenticateToken('orangtua'), gantiPasswordOrtu);

// POST /api/orangtua/lupa-password
router.post('/lupa-password', lupaPasswordOrtu);

// PUT /api/orangtua/:id
router.put('/:id', authenticateToken('operator'), updateOrtu);

// PUT /api/orangtua/reset-password/:id
router.put('/reset-password/:id', authenticateToken('operator'), resetPasswordOrtu);

// DELETE /api/orangtua/:id
router.delete('/:id', authenticateToken('operator'), deleteOrtu);

module.exports = router;
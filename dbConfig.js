// src/dbConfig.js

const { Pool } = require('pg');
const nodemailer = require('nodemailer');

// 1. Konfigurasi Database
const pool = new Pool({
    user: 'postgres', 
    host: 'localhost',
    database: 'db_absensi_tk',
    password: 'MonyetLaper99', // <-- GANTI PASSWORD LO
    port: 5432, 
});

// 2. Kunci Rahasia JWT
const JWT_SECRET = 'rahasia-banget-ini-jangan-disebar';

// 3. Konfigurasi Tukang Pos
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'SekolahKunyuk@gmail.com', // <-- GANTI INI
        pass: 'htwr ozfl liyx xuid'       // <-- GANTI PAKE 16 DIGIT APP PASSWORD
    }
});

// 4. Ekspor semua biar bisa dipake file lain
module.exports = {
    pool,
    JWT_SECRET,
    transporter
};
// src/dbConfig.js

const { Pool } = require('pg');
const nodemailer = require('nodemailer');
require('dotenv').config(); // Biar bisa baca .env di lokal (opsional tapi bagus)

// 1. Konfigurasi Database (PINTER)
const isProduction = process.env.NODE_ENV === 'production';

const connectionString = process.env.DATABASE_URL; // Ambil dari Render

const pool = new Pool({
  connectionString: connectionString ? connectionString : undefined,
  // Kalo gak ada DATABASE_URL (lagi di lokal), pake config manual ini:
  ...(connectionString ? {} : {
    user: 'postgres',
    host: 'localhost',
    database: 'db_absensi_tk',
    password: 'MonyetLaper99', // Ganti password lokal lo
    port: 5432,
  }),
  // SSL wajib buat Render/Supabase, tapi dimatiin di lokal
  ssl: connectionString ? { rejectUnauthorized: false } : false
});

// 2. Kunci Rahasia JWT
const JWT_SECRET = process.env.JWT_SECRET || 'rahasia-banget-ini-jangan-disebar';

// 3. Konfigurasi Tukang Pos
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.NODEMAILER_USER || 'SekolahKunyuk@gmail.com', 
        pass: process.env.NODEMAILER_PASS || 'htwr ozfl liyx xuid'
    }
});

// 4. Ekspor
module.exports = {
    pool,
    JWT_SECRET,
    transporter
};
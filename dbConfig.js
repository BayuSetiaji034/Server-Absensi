const { Pool } = require('pg');
const nodemailer = require('nodemailer');
require('dotenv').config(); // Opsional, buat baca .env di lokal

// 1. Konfigurasi Database (PINTER)
const connectionString = process.env.DATABASE_URL; // Ambil dari Render/Supabase

const pool = new Pool({
  // Kalo ada connectionString (di Render), pake itu.
  // Kalo nggak ada (di laptop), pake undefined biar dia baca config manual di bawah.
  connectionString: connectionString ? connectionString : undefined,
  
  // Config manual (Cuma dipake kalo connectionString kosong/lokal)
  ...(connectionString ? {} : {
    user: 'postgres',
    host: 'localhost',
    database: 'db_absensi_tk',
    password: 'MonyetLaper99', // Password lokal lo
    port: 5432,
  }),

  // SSL: Wajib True buat Render/Supabase, False buat lokal
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

module.exports = {
    pool,
    JWT_SECRET,
    transporter
};
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
require('dotenv').config(); // Biar aman

const isProduction = process.env.NODE_ENV === 'production';
const connectionString = process.env.DATABASE_URL;

// Cek kita lagi di mana (Buat debugging di log Render nanti)
console.log(`[DB CONFIG] Mode: ${isProduction ? 'Production (Render)' : 'Development (Laptop)'}`);
if (connectionString) {
    console.log('[DB CONFIG] Menggunakan DATABASE_URL dari Environment Variable.');
} else {
    console.log('[DB CONFIG] Menggunakan Localhost (127.0.0.1).');
}

const pool = new Pool({
    connectionString: connectionString ? connectionString : undefined,
    // Konfigurasi manual cuma dipake kalo connectionString kosong (di laptop)
    ...(connectionString ? {} : {
        user: 'postgres',
        host: 'db.levhzzdhcvzmtspsiuwd.supabase.co',
        database: 'postgres',
        password: 'MonyetLaper99', // Password laptop lo
        port: 5432,
    }),
    // SSL WAJIB buat Render/Supabase.
    // rejectUnauthorized: false penting biar Render mau connect ke Supabase
    ssl: connectionString ? { rejectUnauthorized: false } : false
});

// Kunci Rahasia JWT
const JWT_SECRET = process.env.JWT_SECRET || 'rahasia-banget-ini-jangan-disebar';

// Konfigurasi Email
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.NODEMAILER_USER || 'SekolahKunyuk@gmail.com',
        pass: process.env.NODEMAILER_PASS || 'htwr ozfl liyx xuid'
    }
});

module.exports = { pool, JWT_SECRET, transporter };
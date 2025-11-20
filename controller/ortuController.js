// src/controllers/ortuController.js

// 1. Impor semua yang kita butuhin
// (Kita ambil 'pool' dari file index.js, kita modif sedikit nanti)
const { pool, JWT_SECRET, transporter } = require('../dbConfig'); // <-- [PENTING] Kita akan bikin file ini
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Kita bikin semua fungsi sebagai 'exports'

// ENDPOINT 25: LOGIN ORANG TUA
exports.loginOrtu = async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).send({ message: 'Username dan password wajib diisi.' });
    }
    try {
        const queryText = 'SELECT * FROM OrangTua WHERE username = $1';
        const dbRes = await pool.query(queryText, [username]); 
        if (dbRes.rows.length === 0) {
            return res.status(404).send({ message: 'Username orang tua tidak ditemukan.' });
        }
        const ortu = dbRes.rows[0];
        const passwordCocok = await bcrypt.compare(password, ortu.password_hash);
        if (!passwordCocok) {
            return res.status(401).send({ message: 'Password salah.' });
        }
        const token = jwt.sign(
            { id_orang_tua: ortu.id, username: ortu.username, role: 'orangtua' }, 
            JWT_SECRET,
            { expiresIn: '30d' }
        );
        res.status(200).send({ 
            message: 'Login berhasil!', 
            token: token,
            nama: ortu.nama_wali
        });
    } catch (err) {
        console.error('Error login orang tua:', err);
        res.status(500).send({ message: 'Terjadi error di server' });
    }
};

// ENDPOINT 26: LIHAT LAPORAN (KHUSUS ORTU)
exports.getLaporanSaya = async (req, res) => {
    const idOrangTua = req.user.id_orang_tua; 
    const { bulan, tahun } = req.query;
    if (!bulan || !tahun) {
        return res.status(400).send({ message: 'Bulan dan tahun wajib diisi.' });
    }
    const client = await pool.connect();
    try {
        const siswaRes = await client.query('SELECT id, nama_siswa, kelas_id FROM Siswa WHERE orang_tua_id = $1', [idOrangTua]);
        const daftarAnak = siswaRes.rows;
        if (daftarAnak.length === 0) {
            return res.status(404).send({ message: 'Tidak ada data siswa yang terhubung.' });
        }
        const daftarIdAnak = daftarAnak.map(anak => anak.id);
        const hariAktifRes = await client.query('SELECT total_hari FROM HariAktif WHERE bulan = $1 AND tahun = $2', [bulan, tahun]);
        let total_hari_aktif = hariAktifRes.rows.length > 0 ? hariAktifRes.rows[0].total_hari : 21; 
        const logRes = await client.query(
            `SELECT siswa_id, timestamp_masuk, status_manual 
             FROM AbsensiLog 
             WHERE siswa_id = ANY($1::int[])
               AND EXTRACT(MONTH FROM tanggal) = $2
               AND EXTRACT(YEAR FROM tanggal) = $3`,
            [daftarIdAnak, bulan, tahun]
        );
        const daftarLogBulanIni = logRes.rows;
        const rekapitulasi_anak = daftarAnak.map(anak => {
            const logSiswaIni = daftarLogBulanIni.filter(log => log.siswa_id === anak.id);
            let total_hadir = 0, total_sakit = 0, total_izin = 0;
            logSiswaIni.forEach(log => {
                if (log.timestamp_masuk) total_hadir++;
                else if (log.status_manual === 'Sakit') total_sakit++;
                else if (log.status_manual === 'Izin') total_izin++;
            });
            const total_tidak_hadir = total_hari_aktif - (total_hadir + total_sakit + total_izin);
            // [TODO] Kita harus impor 'buatKesimpulan' juga
            const kesimpulan_individu = `Rekap... (placeholder)`; // Placeholder
            return {
                id_siswa: anak.id, nama: anak.nama_siswa,
                total_hadir, total_izin, total_sakit, total_tidak_hadir,
                kesimpulan_individu
            };
        });
        res.status(200).send({
            bulan: bulan, tahun: tahun,
            total_hari_aktif: total_hari_aktif,
            data_anak: rekapitulasi_anak 
        });
    } catch (err) {
        console.error('Error ambil laporan ortu:', err);
        res.status(500).send({ message: 'Terjadi error di server' });
    } finally {
        client.release();
    }
};

// ENDPOINT 28: CARI AKUN ORANG TUA (BY NAMA)
exports.searchOrtu = async (req, res) => {
    const { nama } = req.query;
    if (!nama) {
        return res.status(400).json({ message: 'Nama pencarian wajib diisi.' });
    }
    try {
        const queryText = `
            SELECT id, nama_wali, username 
            FROM OrangTua 
            WHERE nama_wali ILIKE $1
            ORDER BY nama_wali LIMIT 10; 
        `;
        const dbRes = await pool.query(queryText, [`%${nama}%`]); 
        res.status(200).send(dbRes.rows);
    } catch (err) {
        console.error('Error search orang tua:', err);
        res.status(500).json({ message: 'Gagal mencari data orang tua.' });
    }
};

// ENDPOINT 29: GET SEMUA AKUN ORTU
exports.getAllOrtu = async (req, res) => {
    try {
        const queryText = `
            SELECT 
                o.id, o.nama_wali, o.username, o.email,
                COALESCE(STRING_AGG(s.nama_siswa, ', '), 'Belum terhubung') AS anak_terhubung
            FROM OrangTua o
            LEFT JOIN Siswa s ON o.id = s.orang_tua_id
            GROUP BY o.id, o.nama_wali, o.username, o.email
            ORDER BY o.nama_wali ASC;
        `;
        const dbRes = await pool.query(queryText); 
        res.status(200).send(dbRes.rows);
    } catch (err) {
        console.error('Error get semua ortu:', err);
        res.status(500).json({ message: 'Gagal memuat data orang tua.' });
    }
};

// ENDPOINT 35: ORTU GANTI PASSWORD SENDIRI
exports.gantiPasswordOrtu = async (req, res) => {
    const idOrangTua = req.user.id_orang_tua; 
    const { password_lama, password_baru } = req.body;
    if (!password_lama || !password_baru || password_baru.length < 6) {
        return res.status(400).json({ message: 'Password lama/baru tidak valid.' });
    }
    const client = await pool.connect();
    try {
        const queryText = 'SELECT password_hash FROM OrangTua WHERE id = $1';
        const dbRes = await client.query(queryText, [idOrangTua]);
        if (dbRes.rows.length === 0) {
            return res.status(404).send({ message: 'Akun tidak ditemukan.' });
        }
        const ortu = dbRes.rows[0];
        const passwordCocok = await bcrypt.compare(password_lama, ortu.password_hash);
        if (!passwordCocok) {
            return res.status(401).send({ message: 'Password lama Anda salah.' });
        }
        const saltRounds = 10;
        const password_hash_baru = await bcrypt.hash(password_baru, saltRounds);
        const updateQuery = 'UPDATE OrangTua SET password_hash = $1 WHERE id = $2';
        await client.query(updateQuery, [password_hash_baru, idOrangTua]);
        res.status(200).send({ message: 'Password Anda berhasil di-update!' });
    } catch (err) {
        console.error('Error ganti password ortu:', err);
        res.status(500).json({ message: 'Gagal meng-update password.' });
    } finally {
        client.release();
    }
};

// ENDPOINT 30: EDIT AKUN ORTU (NAMA & USERNAME)
exports.updateOrtu = async (req, res) => {
    const { id } = req.params;
    const { nama_wali, username, email } = req.body;
    if (!nama_wali || !username || !email) {
        return res.status(400).json({ message: 'Nama wali, username, dan email wajib diisi.' });
    }
    try {
        const queryText = `
            UPDATE OrangTua 
            SET nama_wali = $1, username = $2, email = $3
            WHERE id = $4
            RETURNING id, nama_wali, username, email;
        `;
        const dbRes = await pool.query(queryText, [nama_wali, username, email, id]);
        if (dbRes.rows.length === 0) {
            return res.status(404).send({ message: 'Akun orang tua tidak ditemukan.' });
        }
        res.status(200).send(dbRes.rows[0]);
    } catch (err) {
        if (err.code === '23505') { 
            return res.status(400).send({ message: 'Error: Username atau Email itu sudah dipakai.' });
        }
        console.error('Error update ortu:', err);
        res.status(500).json({ message: 'Gagal meng-update akun.' });
    }
};

// ENDPOINT 32: RESET PASSWORD ORTU
exports.resetPasswordOrtu = async (req, res) => {
    const { id } = req.params;
    const password_baru_acak = 'tkbaru' + Math.floor(100 + Math.random() * 900);
    try {
        const saltRounds = 10;
        const password_hash_baru = await bcrypt.hash(password_baru_acak, saltRounds);
        const queryText = `
            UPDATE OrangTua 
            SET password_hash = $1
            WHERE id = $2
            RETURNING id, nama_wali;
        `;
        const dbRes = await pool.query(queryText, [password_hash_baru, id]);
        if (dbRes.rows.length === 0) {
            return res.status(404).send({ message: 'Akun orang tua tidak ditemukan.' });
        }
        res.status(200).send({ 
            message: `Password untuk "${dbRes.rows[0].nama_wali}" berhasil di-reset!`,
            password_baru: password_baru_acak
        });
    } catch (err) {
        console.error('Error reset password ortu:', err);
        res.status(500).json({ message: 'Gagal me-reset password.' });
    }
};

// ENDPOINT 31: HAPUS AKUN ORTU
exports.deleteOrtu = async (req, res) => {
    const { id } = req.params;
    try {
        const queryText = 'DELETE FROM OrangTua WHERE id = $1 RETURNING nama_wali';
        const dbRes = await pool.query(queryText, [id]);
        if (dbRes.rows.length === 0) {
            return res.status(404).send({ message: 'Akun orang tua tidak ditemukan.' });
        }
        res.status(200).send({ message: `Akun "${dbRes.rows[0].nama_wali}" berhasil dihapus.` });
    } catch (err) {
        console.error('Error hapus ortu:', err);
        res.status(500).json({ message: 'Gagal menghapus akun.' });
    }
};

// ENDPOINT 36: LUPA PASSWORD (ORTU)
exports.lupaPasswordOrtu = async (req, res) => {
    const { usernameAtauEmail } = req.body;
    if (!usernameAtauEmail) {
        return res.status(400).json({ message: 'Username atau Email wajib diisi.' });
    }
    const client = await pool.connect();
    try {
        const queryText = `SELECT id, nama_wali, username, email FROM OrangTua WHERE username = $1 OR email = $1`;
        const dbRes = await client.query(queryText, [usernameAtauEmail]);
        if (dbRes.rows.length === 0) {
            return res.status(200).send({ message: 'Jika akun Anda terdaftar, email reset password akan dikirim.' });
        }
        const ortu = dbRes.rows[0];
        if (!ortu.email) {
            return res.status(400).send({ message: 'Akun ini belum terdaftar email. Hubungi operator.' });
        }
        const password_baru_acak = 'tkbaru' + Math.floor(100 + Math.random() * 900);
        const saltRounds = 10;
        const password_hash_baru = await bcrypt.hash(password_baru_acak, saltRounds);
        await client.query('UPDATE OrangTua SET password_hash = $1 WHERE id = $2', [password_hash_baru, ortu.id]);
        
        await transporter.sendMail({
            from: '"Admin Absensi TK" <email.gmail.lo@gmail.com>', // <-- GANTI EMAIL PENGIRIM LO
            to: ortu.email, 
            subject: 'Reset Password Akun Wali Murid',
            html: `<h3>Halo ${ortu.nama_wali},</h3><p>Password baru Anda adalah: <h2>${password_baru_acak}</h2></p>`
        });
        res.status(200).send({ message: 'Email reset password telah dikirim ke email Anda.' });
    } catch (err) {
        console.error('Error lupa password ortu:', err);
        res.status(500).json({ message: 'Terjadi error di server.' });
    } finally {
        client.release();
    }
};
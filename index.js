// 1. Impor library yang kita butuhkan
const express = require('express');
const { Pool } = require('pg'); // <-- Impor 'Pool' dari 'pg'
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authenticateToken = require('./authMiddleware');
const qrcode = require('qrcode');
const cors = require('cors');
const JSZip = require('jszip');
const nodemailer = require('nodemailer');
const path = require('path'); // <-- TAMBAH INI
const multer = require('multer'); // <-- TAMBAH INI

// 2. Inisialisasi aplikasi Express
const app = express();
// --- [BARU] Konfigurasi Multer (Penyimpanan File) ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Simpen di folder 'uploads/'
  },
  filename: function (req, file, cb) {
    // Bikin nama file unik: 'siswa-20251105-123456.jpg'
    const unik = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'siswa-' + unik + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });
// --- Akhir Konfigurasi Multer ---
const port = process.env.PORT || 3000; // Pake port Render, atau 3001 kalo lokal

// 3. Konfigurasi Koneksi Database (PENTING!)
// Ini adalah 'jembatan' ke database PostgreSQL Anda.
const pool = new Pool({
    user: 'postgres',           // <-- Ganti dengan username Postgres Anda
    host: 'db.levhzzdhcvzmtspsiuwd.supabase.co',
    database: 'postgres',  // <-- Nama database yang tadi kita buat
    password: 'MonyetLaper99',   // <-- GANTI DENGAN PASSWORD ANDA
    port: 6543,                 // Port default PostgreSQL
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'SekolahKunyuk@gmail.com', // <-- GANTI INI
        pass: 'htwr ozfl liyx xuid'       // <-- GANTI PAKE 16 DIGIT APP PASSWORD
    }
});

// 4. Middleware (agar bisa baca JSON)
app.use(express.json());

const JWT_SECRET = 'rahasia-banget-ini-jangan-disebar';

// v-- 2. TAMBAHIN INI --v
// Kasih tau server buat ngebolehin request dari 
// frontend Vite kita (localhost:5173)
app.use(cors({
    origin: [ 
        'http://localhost:5173', 
        'http://localhost:5174',
        'http://192.168.1.6:5173',
        'https://nonzonal-supergallantly-jillian.ngrok-free.dev'
    ] 
}));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// 5. Endpoint 'Hello World' untuk tes
// (Ini hanya untuk memastikan server berjalan)
app.get('/', (req, res) => {
    res.send('Halo! Server absensi sedang berjalan.');
});

// FUNGSI HELPER UNTUK KESIMPULAN
// ===================================
function buatKesimpulan(hadir, izin, sakit, alfa, totalHari) {
    if (alfa > 3) {
        return `Sangat perlu dikonfirmasi, ${alfa} kali tidak hadir tanpa keterangan (Alfa).`;
    }
    if (sakit > 3) {
        return `Perlu diperhatikan, ${sakit} kali absen karena sakit.`;
    }
    if (izin > 3) {
        return `Ada ${izin} kali izin, perlu dikonfirmasi orang tua.`;
    }
    if (alfa == 0 && sakit == 0 && izin == 0 && hadir == totalHari) {
        return 'Kehadiran penuh (100%), luar biasa!';
    }
    if (alfa > 0) {
        return `Ada ${alfa} kali tidak hadir (Alfa).`;
    }
    if (hadir < totalHari) {
        return 'Kehadiran baik.';
    }
    return 'Kehadiran baik.';
}

// ENDPOINT 1: REGISTRASI GURU
// ===================================
app.post('/api/guru/register', authenticateToken('operator'), async (req, res) => {
    // 1. Ambil data dari body request
    const { nama_guru, nomer_guru, password } = req.body;

    // Validasi sederhana (pastikan semua data ada)
    if (!nama_guru || !nomer_guru || !password) {
        return res.status(400).send({ message: 'Semua kolom wajib diisi.' });
    }

    try {
        // 2. Hash password-nya
        const saltRounds = 10; // Standar keamanan
        const password_hash = await bcrypt.hash(password, saltRounds);

        // 3. Masukkan ke database
        const queryText = `
            INSERT INTO Guru(nama_guru, nomer_guru, password_hash)
            VALUES($1, $2, $3)
            RETURNING id, nama_guru, nomer_guru
        `;
        const values = [nama_guru, nomer_guru, password_hash];

        const dbRes = await pool.query(queryText, values);

        // 4. Kirim respon sukses
        res.status(201).send({ 
            message: 'Guru berhasil didaftarkan!',
            data: dbRes.rows[0] // Kirim balik data guru yg baru dibuat (tanpa hash)
        });

    } catch (err) {
        // 5. Tangani error (error paling umum: nomer_guru sudah ada)
        if (err.code === '23505') { // '23505' adalah kode error 'unique violation' di Postgres
            return res.status(400).send({ message: 'Error: Nomer guru sudah terdaftar.' });
        }
        
        // Error server lainnya
        console.error('Error saat registrasi guru:', err);
        res.status(500).send({ message: 'Terjadi error di server' });
    }
});

// ENDPOINT 2: LOGIN GURU
// ===================================
app.post('/api/guru/login', async (req, res) => {
    // 1. Ambil data dari body
    const { nomer_guru, password } = req.body;

    if (!nomer_guru || !password) {
        return res.status(400).send({ message: 'Nomer guru dan password wajib diisi.' });
    }

    try {
        // 2. Cari guru di database berdasarkan nomer_guru
        const queryText = 'SELECT * FROM Guru WHERE nomer_guru = $1';
        const dbRes = await pool.query(queryText, [nomer_guru]);

        // Cek apakah guru ditemukan
        if (dbRes.rows.length === 0) {
            return res.status(404).send({ message: 'Nomer guru tidak ditemukan.' });
        }

        const guru = dbRes.rows[0]; // Data guru dari database

        // 3. Bandingkan password yang dikirim dengan hash di database
        const passwordCocok = await bcrypt.compare(password, guru.password_hash);

        if (!passwordCocok) {
            return res.status(401).send({ message: 'Password salah.' });
        }

        // 4. Jika password cocok, buatkan "Tiket" (JWT)
        const token = jwt.sign(
            { 
                id_guru: guru.id, 
                nomer_guru: guru.nomer_guru,
                role: 'guru'
            }, 
            JWT_SECRET, // Kunci rahasia
            { expiresIn: '24h' } // Token berlaku selama 24 jam
        );

        // 5. Kirim token sebagai respon
        res.status(200).send({
            message: 'Login berhasil!',
            token: token,
            data: {
                id: guru.id,
                nama: guru.nama_guru,
                nomer_guru: guru.nomer_guru
            }
        });

    } catch (err) {
        console.error('Error saat login guru:', err);
        res.status(500).send({ message: 'Terjadi error di server' });
    }
});

// ENDPOINT 3: BUAT KELAS BARU (Protected)
// ===================================
// Perhatikan ada 'authenticateToken' di tengah.
// Ini adalah "Satpam" yang kita pasang.
app.post('/api/kelas', authenticateToken('operator'), async (req, res) => {
    const { nama_kelas } = req.body;

    // Kita bisa tahu siapa yang membuat kelas dari 'req.user'
    // 'req.user' ini didapat dari middleware!
    console.log(`Guru '${req.user.nama}' mencoba membuat kelas baru.`);

    if (!nama_kelas) {
        return res.status(400).send({ message: 'Nama kelas wajib diisi.' });
    }

    try {
        const queryText = 'INSERT INTO Kelas(nama_kelas) VALUES($1) RETURNING *';
        const dbRes = await pool.query(queryText, [nama_kelas]);

        res.status(201).send({
            message: 'Kelas baru berhasil dibuat',
            data: dbRes.rows[0]
        });
    } catch (err) {
        console.error('Error buat kelas:', err);
        res.status(500).send({ message: 'Terjadi error di server' });
    }
});


// ===================================
// ENDPOINT 4: DAPATKAN SEMUA KELAS (Protected)
// ===================================
app.get('/api/kelas', authenticateToken(), async (req, res) => {
    try {
        const queryText = 'SELECT * FROM Kelas ORDER BY id';
        const dbRes = await pool.query(queryText);

        res.status(200).send(dbRes.rows); // Kirim array berisi kelas
    } catch (err) {
        console.error('Error ambil kelas:', err);
        res.status(500).send({ message: 'Terjadi error di server' });
    }
});

// ENDPOINT 5: REGISTRASI SISWA (VERSI BARU - GENERATE KODE LINK)
// ===================================
app.post('/api/siswa', authenticateToken('operator'), upload.single('foto'), async (req, res) => {

    // 1. Ambil data siswa (Data ortu UDAH DIHAPUS)
    const { nama_siswa, tahun_masuk, kelas_id } = req.body;

    // 2. Ambil file foto (Nggak berubah)
    if (!req.file) {
        return res.status(400).send({ message: 'Foto siswa wajib di-upload.' });
    }
    const foto_url = `http://localhost:3000/uploads/${req.file.filename}`;

    // 3. Validasi (Nggak berubah)
    if (!nama_siswa || !tahun_masuk || !kelas_id) {
        return res.status(400).send({ message: 'Data siswa (nama, tahun, kelas) wajib diisi.' });
    }

    const client = await pool.connect(); 
    try {
        await client.query('BEGIN');

        // 4. [BARU] Bikin "Kode Link Ortu"
        // Bikin kode acak 8 karakter (cth: A1B2C3D4)
        const kode_link_ortu = Math.random().toString(36).substring(2, 10).toUpperCase();

        // 5. Generate kode_unik_siswa (Nggak berubah)
        const maxQuery = `SELECT MAX(kode_unik_siswa) as max_kode FROM Siswa WHERE tahun_masuk = $1`;
        const maxRes = await client.query(maxQuery, [tahun_masuk]);
        let nomerUrut = 1;
        if (maxRes.rows[0].max_kode) {
            const angkaTerakhir = maxRes.rows[0].max_kode.substring(4); 
            nomerUrut = parseInt(angkaTerakhir) + 1;
        }
        const nomerUrutString = nomerUrut.toString().padStart(3, '0');
        const kode_unik_siswa = `${tahun_masuk}${nomerUrutString}`;

        // 6. [DIUBAH] Masukkan siswa baru + kode link
        const insertQuery = `
            INSERT INTO Siswa(kode_unik_siswa, nama_siswa, tahun_masuk, kelas_id, foto_url, kode_link_ortu)
            VALUES ($1, $2, $3, $4, $5, $6) 
            RETURNING *
        `;
        // [DIUBAH] Hapus 'ortu_id_to_use', ganti 'kode_link_ortu'
        const insertValues = [kode_unik_siswa, nama_siswa, tahun_masuk, kelas_id, foto_url, kode_link_ortu];
        const dbRes = await client.query(insertQuery, insertValues);

        const siswaBaru = dbRes.rows[0];
        const qrCodeDataUrl = await qrcode.toDataURL(siswaBaru.kode_unik_siswa);

        await client.query('COMMIT');

        // 7. [DIUBAH] Kirim balik datanya, TERMASUK kode_link_ortu
        res.status(201).send({
            message: 'Siswa berhasil didaftarkan!',
            data: siswaBaru,
            qr_code_data_url: qrCodeDataUrl
            // 'kode_link_ortu' udah ada di dalem 'data'
        });

    } catch (err) {
        await client.query('ROLLBACK'); 
        if (err.code === '23505' && err.constraint === 'siswa_kode_link_ortu_key') {
            // Kalo kodenya kebetulan nabrak (jarang banget)
            return res.status(500).send({ message: 'Gagal generate kode unik. Coba submit ulang.' });
        }
        console.error('Error registrasi siswa (v_link_ortu):', err);
        res.status(500).send({ message: 'Terjadi error di server' });
    } finally {
        client.release();
    }
});

// ENDPOINT 6: DAPATKAN DAFTAR ABSEN HARIAN (Protected)
// ===================================
// Ini akan mengambil SEMUA siswa di satu kelas + status absensi HARI INI
app.get('/api/absensi/harian', authenticateToken('guru'), async (req, res) => {
    // Ambil ID kelas dari query parameter (cth: .../harian?kelasId=1)
    const { kelasId } = req.query;
    if (!kelasId) {
        return res.status(400).send({ message: 'ID Kelas wajib diisi.' });
    }

    // Ambil tanggal hari ini dalam format YYYY-MM-DD
    const hariIni = new Date().toISOString().split('T')[0];

    try {
        // Ini query yang sedikit rumit:
        // Kita ambil SEMUA siswa dari 'Siswa'
        // Lalu 'LEFT JOIN' dengan log absensi HANYA UNTUK HARI INI
        const queryText = `
            SELECT 
                s.id, 
                s.nama_siswa, 
                s.kode_unik_siswa,
                a.timestamp_masuk,
                a.timestamp_pulang,
                a.status_manual
            FROM 
                Siswa s
            LEFT JOIN 
                AbsensiLog a ON s.id = a.siswa_id AND a.tanggal = $1
            WHERE 
                s.kelas_id = $2
            ORDER BY
                s.nama_siswa;
        `;
        
        const dbRes = await pool.query(queryText, [hariIni, kelasId]);
        
        // Kirim datanya (ini akan di-render di aplikasi mobile)
        res.status(200).send(dbRes.rows);

    } catch (err) {
        console.error('Error ambil absen harian:', err);
        res.status(500).send({ message: 'Terjadi error di server' });
    }
});


// ===================================
// ENDPOINT 7: PROSES SCAN QR (Protected)
// ===================================
app.post('/api/scan', authenticateToken('guru'), async (req, res) => {
    // 1. Ambil 'kode_unik_siswa' dari body (hasil scan)
    const { kodeSiswa } = req.body;
    if (!kodeSiswa) {
        return res.status(400).send({ message: 'Kode siswa wajib diisi.' });
    }

    const hariIni = new Date().toISOString().split('T')[0];
    const waktuSekarang = new Date();

    try {
        // 2. Cari siswa berdasarkan kode uniknya
        const siswaRes = await pool.query('SELECT * FROM Siswa WHERE kode_unik_siswa = $1', [kodeSiswa]);
        if (siswaRes.rows.length === 0) {
            return res.status(404).send({ message: 'Siswa tidak ditemukan (QR tidak valid)' });
        }
        const siswa = siswaRes.rows[0];

        // 3. Cek apakah sudah ada log absensi untuk siswa ini HARI INI
        const logRes = await pool.query('SELECT * FROM AbsensiLog WHERE siswa_id = $1 AND tanggal = $2', [siswa.id, hariIni]);

        // 4. Logika Kunci: Check-In atau Check-Out?
        
        if (logRes.rows.length === 0) {
            // BELUM ADA LOG: Ini adalah Check-In (Scan Masuk / HIJAU)
            const queryText = `
                INSERT INTO AbsensiLog(siswa_id, tanggal, timestamp_masuk, status_manual)
                VALUES ($1, $2, $3, 'Hadir')
                RETURNING *
            `;
            await pool.query(queryText, [siswa.id, hariIni, waktuSekarang]);
            
            res.status(200).send({
                message: 'Check-in berhasil!',
                status: 'check_in',
                data: siswa
            });

        } else {
            // SUDAH ADA LOG
            const logHariIni = logRes.rows[0];

            if (logHariIni.timestamp_pulang) {
                // SUDAH PULANG: Scan tidak berefek apa-apa
                return res.status(200).send({
                    message: 'Siswa ini sudah discan pulang hari ini.',
                    status: 'already_checked_out',
                    data: siswa
                });
            }

            // BELUM PULANG: Ini adalah Check-Out (Scan Pulang / MERAH)
            const queryText = `
                UPDATE AbsensiLog SET timestamp_pulang = $1
                WHERE id = $2
                RETURNING *
            `;
            await pool.query(queryText, [waktuSekarang, logHariIni.id]);

            res.status(200).send({
                message: 'Check-out berhasil!',
                status: 'check_out',
                data: siswa
            });
        }

    } catch (err) {
        console.error('Error proses scan:', err);
        res.status(500).send({ message: 'Terjadi error di server' });
    }
});

// ENDPOINT 8: INPUT ABSEN MANUAL (VERSI UPGRADE DENGAN NOTIFIKASI)
// ===================================
app.post('/api/absensi/manual', authenticateToken('guru'), async (req, res) => {
    // 1. Ambil data dari body (Nggak berubah)
    const { siswa_id, tanggal, status_manual, alasan } = req.body;

    if (!siswa_id || !tanggal || !status_manual) {
        return res.status(400).send({ message: 'ID Siswa, tanggal, dan status wajib diisi.' });
    }

    const validStatus = ['Izin', 'Sakit', 'Alfa'];
    if (!validStatus.includes(status_manual)) {
        return res.status(400).send({ message: "Status harus 'Izin', 'Sakit', atau 'Alfa'." });
    }

    try {
        // 2. Simpen data absensi ke database (Nggak berubah)
        // Kita pake 'UPSERT'
        const queryText = `
            INSERT INTO AbsensiLog (siswa_id, tanggal, status_manual, alasan)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (siswa_id, tanggal) 
            DO UPDATE SET 
                status_manual = $3, 
                alasan = $4,
                timestamp_masuk = NULL,
                timestamp_pulang = NULL
            RETURNING *;
        `;
        const values = [siswa_id, tanggal, status_manual, alasan || null];
        const dbRes = await pool.query(queryText, values);

        // =======================================================
        // 3. [BARU] KIRIM NOTIFIKASI EMAIL KE ORTU
        // =======================================================
        // Kita kirim email HANYA kalo statusnya 'Sakit' atau 'Alfa'
        if (status_manual === 'Sakit' || status_manual === 'Alfa') {
            
            // Kita pake try...catch di dalem sini.
            // Kalo email GAGAL, kita tetep lanjut kirim respon 200 ke GURU.
            try {
                // 3a. Cari data siswa & ortu-nya
                const infoQuery = `
                    SELECT 
                        s.nama_siswa, 
                        o.nama_wali, 
                        o.email 
                    FROM Siswa s
                    JOIN OrangTua o ON s.orang_tua_id = o.id
                    WHERE s.id = $1 AND o.email IS NOT NULL; 
                `;
                const infoRes = await pool.query(infoQuery, [siswa_id]); 

                if (infoRes.rows.length > 0) {
                    const data = infoRes.rows[0];
                    
                    // 3b. Kirim email pake transporter (yang udah ada di atas)
                    await transporter.sendMail({
                        from: '"Admin Absensi TK" <email.gmail.lo@gmail.com>', // <-- GANTI EMAIL PENGIRIM LO
                        to: data.email, // Email ortu dari database
                        subject: `Notifikasi Absensi: ${data.nama_siswa} (${status_manual})`,
                        html: `
                            <h3>Halo ${data.nama_wali},</h3>
                            <p>Ini adalah notifikasi otomatis.</p>
                            <p>Anak Anda, <b>${data.nama_siswa}</b>, telah ditandai <b>${status_manual}</b> oleh guru pada hari ini (${new Date(tanggal).toLocaleDateString('id-ID')}).</p>
                            ${alasan ? `<p>Keterangan: ${alasan}</p>` : ''}
                            <p>Terima kasih.</p>
                        `
                    });
                    
                    console.log(`Notifikasi ${status_manual} terkirim ke ortu ${data.nama_wali} (email: ${data.email})`);
                }

            } catch (emailErr) {
                // Kalo email gagal, jangan stop prosesnya. Cuma catet di log server.
                console.error('Gagal mengirim email notifikasi ke ortu:', emailErr);
            }
        }
        // ===================================
        // AKHIR FITUR NOTIFIKASI
        // ===================================

        // 4. Kirim respon sukses ke GURU (Nggak berubah)
        res.status(200).send({
            message: `Absensi ${status_manual} untuk siswa berhasil dicatat.`,
            data: dbRes.rows[0]
        });

    } catch (err) {
        console.error('Error input absen manual:', err);
        res.status(500).send({ message: 'Terjadi error di server' });
    }
});

// ENDPOINT 9: LAPORAN BULANAN (VERSI PINTAR)
// ===================================
app.get('/api/laporan/bulanan', authenticateToken(), async (req, res) => {
    // 1. Ambil query params (UDAH NGGAK ADA 'total_hari_aktif'!)
    const { kelasId, bulan, tahun } = req.query;

    if (!kelasId || !bulan || !tahun) {
        return res.status(400).send({ 
            message: 'kelasId, bulan, dan tahun wajib diisi.' 
        });
    }

    const client = await pool.connect(); // Buka koneksi

    try {
        // 2. AMBIL 'total_hari_aktif' DARI TABEL BARU KITA
        const hariAktifRes = await client.query(
            'SELECT total_hari FROM HariAktif WHERE bulan = $1 AND tahun = $2',
            [bulan, tahun]
        );

        // Kalo Kepsek belom nentuin, kita pake default 21
        let total_hari_aktif = 21; 
        if (hariAktifRes.rows.length > 0) {
            total_hari_aktif = hariAktifRes.rows[0].total_hari;
        } else {
            console.warn(`Peringatan: Total hari aktif u/ ${bulan}-${tahun} belum di-set. Pake default 21.`);
        }

        // 3. Ambil SEMUA siswa di kelas itu
        const siswaRes = await client.query('SELECT * FROM Siswa WHERE kelas_id = $1 ORDER BY nama_siswa', [kelasId]);
        const daftarSiswa = siswaRes.rows;

        // 4. Ambil SEMUA log absensi
        const logRes = await client.query(
            `SELECT siswa_id, timestamp_masuk, status_manual 
             FROM AbsensiLog 
             WHERE siswa_id IN (SELECT id FROM Siswa WHERE kelas_id = $1)
               AND EXTRACT(MONTH FROM tanggal) = $2
               AND EXTRACT(YEAR FROM tanggal) = $3`,
            [kelasId, bulan, tahun]
        );
        const daftarLogBulanIni = logRes.rows;

        let totalSiswaAlfa = 0; 

        // 5. Proses Data di JavaScript (Looping)
        const rekapitulasi_siswa = daftarSiswa.map(siswa => {
            const logSiswaIni = daftarLogBulanIni.filter(log => log.siswa_id === siswa.id);

            let total_hadir = 0;
            let total_sakit = 0;
            let total_izin = 0;

            logSiswaIni.forEach(log => {
                if (log.timestamp_masuk) {
                    total_hadir++;
                } else if (log.status_manual === 'Sakit') {
                    total_sakit++;
                } else if (log.status_manual === 'Izin') {
                    total_izin++;
                }
            });

            // 6. HITUNG ALFA PAKE ANGKA DARI DATABASE
            const total_tidak_hadir = total_hari_aktif - (total_hadir + total_sakit + total_izin);

            if(total_tidak_hadir > 0) totalSiswaAlfa++;

            const kesimpulan_individu = buatKesimpulan(total_hadir, total_izin, total_sakit, total_tidak_hadir, total_hari_aktif);

            return {
                id_siswa: siswa.id,
                nama: siswa.nama_siswa,
                total_hadir,
                total_izin,
                total_sakit,
                total_tidak_hadir,
                kesimpulan_individu
            };
        });

        // 7. Buat Kesimpulan Umum
        const kesimpulan_umum = `Tingkat kehadiran kelas baik. Perlu perhatian pada ${totalSiswaAlfa} siswa dengan ketidakhadiran (Alfa) tinggi.`;

        // 8. Kirim Respon Final
        res.status(200).send({
            kelas: `Kelas ID ${kelasId}`, 
            bulan: `${bulan}/${tahun}`,
            total_hari_aktif: total_hari_aktif, // Kirim hari aktif yg dipake
            kesimpulan_umum,
            rekapitulasi_siswa
        });

    } catch (err) {
        console.error('Error buat laporan bulanan (v_pintar):', err);
        res.status(500).send({ message: 'Terjadi error di server' });
    } finally {
        client.release(); // Selalu lepasin client
    }
});

// ENDPOINT 10: SET HARI AKTIF (Protected)
// ===================================
// Ini dipake sama Admin Web
app.post('/api/hari-aktif', authenticateToken('operator'), async (req, res) => {
    const { bulan, tahun, total_hari } = req.body;

    if (!bulan || !tahun || !total_hari) {
        return res.status(400).send({ message: 'Bulan, tahun, dan total hari wajib diisi.' });
    }

    try {
        // Pake "UPSERT":
        // Kalo datanya udah ada (bulan/tahun sama), UPDATE
        // Kalo belum ada, INSERT
        const queryText = `
            INSERT INTO HariAktif (bulan, tahun, total_hari)
            VALUES ($1, $2, $3)
            ON CONFLICT (bulan, tahun) 
            DO UPDATE SET total_hari = $3
            RETURNING *;
        `;
        const values = [bulan, tahun, total_hari];
        const dbRes = await pool.query(queryText, values);

        res.status(200).send({
            message: 'Total hari aktif berhasil disimpan!',
            data: dbRes.rows[0]
        });

    } catch (err) {
        console.error('Error set hari aktif:', err);
        res.status(500).send({ message: 'Terjadi error di server' });
    }
});

// ENDPOINT 11: LOGIN OPERATOR (TAHAP 1 - KIRIM KODE 2FA)
// ===================================
app.post('/api/operator/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).send({ message: 'Username dan password wajib diisi.' });
    }

    const client = await pool.connect();
    try {
        // 1. Cari operator di database
        const queryText = 'SELECT * FROM Operator WHERE username = $1';
        const dbRes = await pool.query(queryText, [username]);

        if (dbRes.rows.length === 0) {
            return res.status(404).send({ message: 'Username operator tidak ditemukan.' });
        }

        const operator = dbRes.rows[0];
        // 2. Cek email-nya (WAJIB ADA)
        if (!operator.email) {
            return res.status(400).send({ message: 'Akun operator ini tidak memiliki email terdaftar untuk 2FA. Hubungi admin lain.' });
        }
        
        // 3. Cek password
        const passwordCocok = await bcrypt.compare(password, operator.password_hash);
        if (!passwordCocok) {
            return res.status(401).send({ message: 'Password salah.' });
        }

        // 4. KALO PASSWORD BENER: Bikin kode 2FA
        const kode_2fa = Math.floor(100000 + Math.random() * 900000).toString(); // Bikin 6 digit angka acak
        const waktu_kadaluarsa = new Date(Date.now() + 10 * 60 * 1000); // Berlaku 10 menit

        // 5. Simpen kode 2FA ke database (tabel baru lo)
        await client.query('BEGIN');
        // Hapus kode lama (kalo ada)
        await client.query('DELETE FROM Operator2FA WHERE operator_id = $1', [operator.id]);
        // Masukin kode baru
        await client.query(
            'INSERT INTO Operator2FA (operator_id, kode_2fa, waktu_kadaluarsa) VALUES ($1, $2, $3)',
            [operator.id, kode_2fa, waktu_kadaluarsa]
        );
        
        // 6. Kirim email (pake transporter lo)
        await transporter.sendMail({
            from: '"Admin Absensi TK" <email.gmail.lo@gmail.com>', // <-- GANTI EMAIL LO
            to: operator.email, // Email operator dari database
            subject: 'Kode Verifikasi (2FA) Login Operator',
            html: `
                <h3>Halo ${operator.nama_operator},</h3>
                <p>Seseorang mencoba login ke akun operator Anda.</p>
                <p>Masukkan kode 6 digit ini untuk melanjutkan:</p>
                <h2>${kode_2fa}</h2>
                <p>Kode ini hanya berlaku selama 10 menit.</p>
            `
        });
        
        await client.query('COMMIT');
        
        // 7. Kirim respon sukses ke frontend
        // (NGGAK NGASIH TOKEN, cuma ngasih tau buat cek email)
        res.status(200).send({
            message: 'Login berhasil, silakan cek email Anda untuk kode verifikasi 6 digit.'
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error saat login operator (Tahap 1):', err);
        res.status(500).send({ message: 'Terjadi error di server' });
    } finally {
        client.release();
    }
});

// [ENDPOINT BARU]: LOGIN OPERATOR (TAHAP 2 - VERIFIKASI KODE)
// ===================================
app.post('/api/operator/login-verify', async (req, res) => {
    const { username, kode_2fa } = req.body;
    if (!username || !kode_2fa) {
        return res.status(400).send({ message: 'Username dan kode 2FA wajib diisi.' });
    }

    try {
        // 1. Cari kodenya di database
        const queryText = `
            SELECT * FROM Operator2FA 
            WHERE operator_id = (SELECT id FROM Operator WHERE username = $1)
        `;
        const dbRes = await pool.query(queryText, [username]);

        if (dbRes.rows.length === 0) {
            return res.status(404).send({ message: 'Kode verifikasi tidak ditemukan. Coba login ulang.' });
        }

        const data2FA = dbRes.rows[0];

        // 2. Cek kodenya bener nggak
        if (data2FA.kode_2fa !== kode_2fa) {
            return res.status(401).send({ message: 'Kode 2FA salah.' });
        }

        // 3. Cek kodenya kadaluarsa nggak
        if (new Date() > new Date(data2FA.waktu_kadaluarsa)) {
            return res.status(401).send({ message: 'Kode 2FA sudah kadaluarsa. Coba login ulang.' });
        }

        // 4. KALO SEMUA BENER: Baru kita bikin TOKEN JWT
        // Ambil data operator-nya lagi
        const opRes = await pool.query('SELECT * FROM Operator WHERE id = $1', [data2FA.operator_id]);
        const operator = opRes.rows[0];

        const token = jwt.sign(
            { 
                id_operator: operator.id, 
                username: operator.username,
                role: 'operator' 
            }, 
            JWT_SECRET,
            { expiresIn: '8h' } 
        );

        // 5. Hapus kode 2FA yang udah kepake
        await pool.query('DELETE FROM Operator2FA WHERE id = $1', [data2FA.id]);

        // 6. Kirim TOKEN-nya ke frontend
        res.status(200).send({
            message: 'Verifikasi berhasil! Selamat datang.',
            token: token
        });

    } catch (err) {
        console.error('Error saat login operator (Tahap 2):', err);
        res.status(500).send({ message: 'Terjadi error di server' });
    }
});

// ENDPOINT 12: REGISTER OPERATOR (SEKALI PAKE, ABIS ITU APUS)
// ===================================
app.post('/api/operator/register-super-admin', async (req, res) => {
    const { username, password, nama_operator } = req.body;
    if (!username || !password || !nama_operator) {
        return res.status(400).send({ message: 'Semua kolom wajib diisi.' });
    }
    try {
        // Kita pake 'bcrypt' yang udah ada
        const saltRounds = 10;
        const password_hash = await bcrypt.hash(password, saltRounds);

        // Masukin ke tabel 'Operator' BARU kita
        const queryText = `
            INSERT INTO Operator(username, password_hash, nama_operator)
            VALUES($1, $2, $3)
            RETURNING id, username
        `;
        const values = [username, password_hash, nama_operator];
        const dbRes = await pool.query(queryText, values);

        res.status(201).send({ 
            message: 'OPERATOR SUPER ADMIN BERHASIL DIBUAT!',
            data: dbRes.rows[0]
        });
    } catch (err) {
        if (err.code === '23505') { 
            return res.status(400).send({ message: 'Error: Username operator sudah ada.' });
        }
        res.status(500).send({ message: 'Terjadi error di server' });
    }
});

// ENDPOINT 13, 14, 15: CRUD OPERATOR (dijaga 'operator')
// ===================================

// 1. (POST) Bikin Operator BARU (Aman)
// ENDPOINT 13: (POST) Bikin Operator BARU (VERSI UPGRADE + EMAIL)
// ===================================
app.post('/api/operators', authenticateToken('operator'), async (req, res) => {
    // [DIUBAH] Ambil 'email' dari body
    const { username, password, nama_operator, email } = req.body;

    // [DIUBAH] Tambah validasi 'email'
    if (!username || !password || !nama_operator || !email) {
        return res.status(400).send({ message: 'Semua kolom (termasuk email) wajib diisi.' });
    }

    try {
        const saltRounds = 10;
        const password_hash = await bcrypt.hash(password, saltRounds);

        // [DIUBAH] Tambah 'email' ke query
        const queryText = `
            INSERT INTO Operator(username, password_hash, nama_operator, email)
            VALUES($1, $2, $3, $4)
            RETURNING id, username, nama_operator, email
        `;
        // [DIUBAH] Tambah 'email' ke values
        const values = [username, password_hash, nama_operator, email];
        const dbRes = await pool.query(queryText, values);

        res.status(201).send({ 
            message: 'Operator baru berhasil ditambahkan!',
            data: dbRes.rows[0]
        });
    } catch (err) {
        // [DIUBAH] Tambahin cek 'unique' buat email
        if (err.code === '23505') { 
            if (err.constraint === 'operator_username_key') {
                return res.status(400).send({ message: 'Error: Username operator sudah ada.' });
            }
            if (err.constraint === 'operator_email_key') {
                return res.status(400).send({ message: 'Error: Email itu sudah dipakai.' });
            }
        }
        res.status(500).send({ message: 'Terjadi error di server' });
    }
});

// 2. (GET) Ambil SEMUA daftar Operator
app.get('/api/operators', authenticateToken('operator'), async (req, res) => {
    try {
        // Kita ambil semua KECUALI password hash-nya (biar aman)
        const queryText = 'SELECT id, username, nama_operator FROM Operator ORDER BY id';
        const dbRes = await pool.query(queryText);
        res.status(200).send(dbRes.rows);
    } catch (err) {
        res.status(500).send({ message: 'Terjadi error di server' });
    }
});

// 3. (DELETE) Hapus Operator
app.delete('/api/operators/:id', authenticateToken('operator'), async (req, res) => {
    const { id } = req.params; // ID operator yang mau dihapus

    // Fitur pengaman: Jangan biarin operator nge-hapus dirinya sendiri
    if (req.user.id_operator == id) {
        return res.status(400).send({ message: 'Tidak bisa menghapus akun sendiri.' });
    }

    try {
        const queryText = 'DELETE FROM Operator WHERE id = $1 RETURNING *';
        const dbRes = await pool.query(queryText, [id]);

        if (dbRes.rows.length === 0) {
            return res.status(404).send({ message: 'Operator tidak ditemukan.' });
        }

        res.status(200).send({ 
            message: `Operator "${dbRes.rows[0].nama_operator}" berhasil dihapus.`
        });
    } catch (err) {
        res.status(500).send({ message: 'Terjadi error di server' });
    }
});

// ENDPOINT 16: UPDATE (EDIT) SISWA (Protected Operator)
// ===================================
app.put('/api/siswa/:id', authenticateToken('operator'), async (req, res) => {
    const { id } = req.params; // ID siswa yang mau di-edit
    const { nama_siswa, kelas_id } = req.body; // Data barunya

    if (!nama_siswa || !kelas_id) {
        return res.status(400).send({ message: 'Nama siswa dan ID kelas wajib diisi.' });
    }

    try {
        const queryText = `
            UPDATE Siswa 
            SET nama_siswa = $1, kelas_id = $2
            WHERE id = $3
            RETURNING *;
        `;
        const values = [nama_siswa, kelas_id, id];
        const dbRes = await pool.query(queryText, values);

        if (dbRes.rows.length === 0) {
            return res.status(404).send({ message: 'Siswa tidak ditemukan.' });
        }

        res.status(200).send({
            message: 'Data siswa berhasil di-update!',
            data: dbRes.rows[0]
        });
    } catch (err) {
        console.error('Error update siswa:', err);
        res.status(500).send({ message: 'Terjadi error di server' });
    }
});

// ===================================
// ENDPOINT 17: DELETE (HAPUS) SISWA (Protected Operator)
// ===================================
app.delete('/api/siswa/:id', authenticateToken('operator'), async (req, res) => {
    const { id } = req.params; // ID siswa yang mau dihapus

    // PENTING: Kita harus hapus log absensinya dulu
    // Kalo nggak, database bakal "ngamuk" (Foreign Key Violation)
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Mulai 'transaction'

        // 1. Hapus log absensinya dulu
        await client.query('DELETE FROM AbsensiLog WHERE siswa_id = $1', [id]);

        // 2. Baru hapus siswanya
        const siswaRes = await client.query('DELETE FROM Siswa WHERE id = $1 RETURNING *', [id]);

        if (siswaRes.rows.length === 0) {
            // Kalo siswanya nggak ada, batalin
            await client.query('ROLLBACK');
            return res.status(404).send({ message: 'Siswa tidak ditemukan.' });
        }

        await client.query('COMMIT'); // Sukses, simpan perubahan
        res.status(200).send({ 
            message: `Siswa "${siswaRes.rows[0].nama_siswa}" berhasil dihapus.`
        });
    } catch (err) {
        await client.query('ROLLBACK'); // Kalo gagal, batalin
        console.error('Error hapus siswa:', err);
        res.status(500).send({ message: 'Terjadi error di server' });
    } finally {
        client.release();
    }
});

// ENDPOINT 18: UPDATE (EDIT) KELAS (Protected Operator)
// ===================================
app.put('/api/kelas/:id', authenticateToken('operator'), async (req, res) => {
    const { id } = req.params; // ID kelas yang mau di-edit
    const { nama_kelas } = req.body; // Data nama baru

    if (!nama_kelas) {
        return res.status(400).send({ message: 'Nama kelas wajib diisi.' });
    }

    try {
        const queryText = `
            UPDATE Kelas 
            SET nama_kelas = $1
            WHERE id = $2
            RETURNING *;
        `;
        const values = [nama_kelas, id];
        const dbRes = await pool.query(queryText, values);

        if (dbRes.rows.length === 0) {
            return res.status(404).send({ message: 'Kelas tidak ditemukan.' });
        }

        res.status(200).send({
            message: 'Nama kelas berhasil di-update!',
            data: dbRes.rows[0]
        });
    } catch (err) {
        console.error('Error update kelas:', err);
        res.status(500).send({ message: 'Terjadi error di server' });
    }
});

// ===================================
// ENDPOINT 19: DELETE (HAPUS) KELAS (Protected Operator)
// ===================================
app.delete('/api/kelas/:id', authenticateToken('operator'), async (req, res) => {
    const { id } = req.params; // ID kelas yang mau dihapus

    const client = await pool.connect();
    try {
        // PENTING: Kita cek dulu, ada siswanya nggak?
        const cekSiswaQuery = 'SELECT COUNT(*) FROM Siswa WHERE kelas_id = $1';
        const cekRes = await client.query(cekSiswaQuery, [id]);

        if (cekRes.rows[0].count > 0) {
            // KALO MASIH ADA SISWA, TOLAK HAPUS!
            return res.status(400).send({ 
                message: `Gagal hapus. Kelas ini masih punya ${cekRes.rows[0].count} siswa.` 
            });
        }

        // Kalo aman (nggak ada siswa), baru hapus
        const deleteQuery = 'DELETE FROM Kelas WHERE id = $1 RETURNING *';
        const dbRes = await client.query(deleteQuery, [id]);

        if (dbRes.rows.length === 0) {
            return res.status(404).send({ message: 'Kelas tidak ditemukan.' });
        }

        res.status(200).send({ 
            message: `Kelas "${dbRes.rows[0].nama_kelas}" berhasil dihapus.`
        });
    } catch (err) {
        console.error('Error hapus kelas:', err);
        res.status(500).send({ message: 'Terjadi error di server' });
    } finally {
        client.release();
    }
});

// ENDPOINT 20, 21, 22: CRUD GURU (dijaga 'operator')
// ===================================

// 1. (GET) Ambil SEMUA daftar Guru
app.get('/api/guru', authenticateToken('operator'), async (req, res) => {
    try {
        // Kita ambil semua KECUALI password hash-nya
        const queryText = 'SELECT id, nomer_guru, nama_guru FROM Guru ORDER BY id';
        const dbRes = await pool.query(queryText);
        res.status(200).send(dbRes.rows);
    } catch (err) {
        res.status(500).send({ message: 'Terjadi error di server' });
    }
});

// 2. (PUT) Edit Guru (Nama atau Nomer Guru)
app.put('/api/guru/:id', authenticateToken('operator'), async (req, res) => {
    const { id } = req.params;
    const { nama_guru, nomer_guru } = req.body;

    if (!nama_guru || !nomer_guru) {
        return res.status(400).send({ message: 'Nama dan nomer guru wajib diisi.' });
    }

    try {
        const queryText = `
            UPDATE Guru 
            SET nama_guru = $1, nomer_guru = $2
            WHERE id = $3
            RETURNING id, nama_guru, nomer_guru;
        `;
        const values = [nama_guru, nomer_guru, id];
        const dbRes = await pool.query(queryText, values);

        if (dbRes.rows.length === 0) {
            return res.status(404).send({ message: 'Guru tidak ditemukan.' });
        }
        res.status(200).send({
            message: 'Data guru berhasil di-update!',
            data: dbRes.rows[0]
        });
    } catch (err) {
        if (err.code === '23505') { // Kalo nomer guru-nya nabrak
            return res.status(400).send({ message: 'Error: Nomer guru itu sudah dipakai.' });
        }
        console.error('Error update guru:', err);
        res.status(500).send({ message: 'Terjadi error di server' });
    }
});

// 3. (DELETE) Hapus Guru
app.delete('/api/guru/:id', authenticateToken('operator'), async (req, res) => {
    const { id } = req.params;

    // Cek: Jangan biarin operator nge-hapus guru terakhir
    // (Ini opsional, tapi bagus)

    try {
        const queryText = 'DELETE FROM Guru WHERE id = $1 RETURNING *';
        const dbRes = await pool.query(queryText, [id]);

        if (dbRes.rows.length === 0) {
            return res.status(404).send({ message: 'Guru tidak ditemukan.' });
        }
        res.status(200).send({ 
            message: `Guru "${dbRes.rows[0].nama_guru}" berhasil dihapus.`
        });
    } catch (err) {
        // Nggak ada 'Foreign Key' ke guru, jadi harusnya aman
        res.status(500).send({ message: 'Terjadi error di server' });
    }
});

// ENDPOINT 23: GET DAFTAR SEMUA SISWA (VERSI BERSIH)
// ===================================
app.get('/api/siswa', authenticateToken('operator'), async (req, res) => {
    try {
        // Ini query yang bersih, nggak ada karakter aneh
        const queryText = `
            SELECT 
                s.id, 
                s.kode_unik_siswa, 
                s.nama_siswa, 
                s.tahun_masuk, 
                k.nama_kelas,
                s.foto_url
            FROM 
                Siswa s
            LEFT JOIN 
                Kelas k ON s.kelas_id = k.id
            ORDER BY
                k.nama_kelas, s.nama_siswa;
        `;
        const dbRes = await pool.query(queryText);

        // Generate QR untuk SETIAP siswa
        const siswaDenganQR = await Promise.all(dbRes.rows.map(async (siswa) => {
            // Pastiin kode uniknya ada, kalo nggak (NULL), pake string kosong
            const qrData = siswa.kode_unik_siswa || ''; 
            const qrCodeDataUrl = await qrcode.toDataURL(qrData, {
              errorCorrectionLevel: 'H', margin: 1
            });
            return {
                ...siswa,
                qr_code_data_url: qrCodeDataUrl
            };
        }));

        res.status(200).send(siswaDenganQR); // Kirim data yang udah ada QR-nya

    } catch (err) {
        console.error('Error ambil semua siswa:', err);
        res.status(500).send({ message: 'Terjadi error di server' });
    }
});

// ENDPOINT 24: GET SISWA BERDASARKAN KELAS (VERSI BERSIH)
// ===================================
app.get('/api/siswa/by-kelas/:kelasId', authenticateToken('operator'), async (req, res) => {
    const { kelasId } = req.params;

    if (!kelasId) {
        return res.status(400).json({ message: 'Class ID is required' });
    }

    try {
        const queryText = `
            SELECT 
                s.id, s.kode_unik_siswa, s.nama_siswa, 
                s.tahun_masuk, k.nama_kelas, s.foto_url
            FROM Siswa s
            LEFT JOIN Kelas k ON s.kelas_id = k.id
            WHERE s.kelas_id = $1
            ORDER BY s.nama_siswa;
        `;
        const dbRes = await pool.query(queryText, [kelasId]); 

        // [BARU] Generate QR untuk SETIAP siswa
        const siswaDenganQR = await Promise.all(dbRes.rows.map(async (siswa) => {
            const qrCodeDataUrl = await qrcode.toDataURL(siswa.kode_unik_siswa, {
              errorCorrectionLevel: 'H', margin: 1
            });
            return {
                ...siswa,
                qr_code_data_url: qrCodeDataUrl
            };
        }));

        res.status(200).send(siswaDenganQR); // Kirim data yang udah ada QR-nya

    } catch (err) {
        console.error('Error fetching siswa by kelas:', err);
        res.status(500).json({ message: 'Gagal memuat siswa.' });
    }
});

// ENDPOINT BARU: ORTU DAFTAR (MANDIRI)
// ===================================
app.post('/api/orangtua/register', async (req, res) => {
    const { nama_wali, username, email, password } = req.body;

    if (!nama_wali || !username || !email || !password) {
        return res.status(400).json({ message: 'Semua field (Nama, Username, Email, Password) wajib diisi.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ message: 'Password minimal 6 karakter.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Cek username
        const cekUserQuery = 'SELECT id FROM OrangTua WHERE username = $1';
        const cekUserRes = await client.query(cekUserQuery, [username]);
        if (cekUserRes.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).send({ message: 'Username sudah terdaftar.' });
        }
        
        // Cek email
        const cekEmailQuery = 'SELECT id FROM OrangTua WHERE email = $1';
        const cekEmailRes = await client.query(cekEmailQuery, [email]);
        if (cekEmailRes.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).send({ message: 'Email sudah terdaftar.' });
        }

        // Hash password
        const saltRounds = 10;
        const password_hash = await bcrypt.hash(password, saltRounds);

        // Masukkan ke tabel OrangTua
        const ortuQuery = `
            INSERT INTO OrangTua(nama_wali, username, password_hash, email)
            VALUES ($1, $2, $3, $4)
            RETURNING id, nama_wali, username, email;
        `;
        const ortuRes = await client.query(ortuQuery, [nama_wali, username, password_hash, email]);

        await client.query('COMMIT');
        
        // Kirim respon sukses (tanpa token, suruh login)
        res.status(201).send({
            message: 'Registrasi berhasil! Silakan login.',
            data: ortuRes.rows[0]
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error registrasi ortu:', err);
        res.status(500).json({ message: 'Terjadi error di server.' });
    } finally {
        client.release();
    }
});

// ENDPOINT 25: LOGIN ORANG TUA
// ===================================
app.post('/api/orangtua/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).send({ message: 'Username dan password wajib diisi.' });
    }

    try {
        // 1. Carinya di tabel 'OrangTua'
        const queryText = 'SELECT * FROM OrangTua WHERE username = $1';
        // Pake 'pool' (ini udah bener)
        const dbRes = await pool.query(queryText, [username]); 

        if (dbRes.rows.length === 0) {
            return res.status(404).send({ message: 'Username orang tua tidak ditemukan.' });
        }
        
        const ortu = dbRes.rows[0];
        const passwordCocok = await bcrypt.compare(password, ortu.password_hash);

        if (!passwordCocok) {
            return res.status(401).send({ message: 'Password salah.' });
        }

        // 2. Bikin JWT dengan ROLE BARU: 'orangtua'
        const token = jwt.sign(
            { 
                id_orang_tua: ortu.id, 
                username: ortu.username,
                role: 'orangtua' // <-- ROLE BARU
            }, 
            JWT_SECRET,
            { expiresIn: '30d' } // Token ortu kita buat 30 hari
        );
        
        // 3. Kirim tokennya
        res.status(200).send({ 
            message: 'Login berhasil!', 
            token: token,
            nama: ortu.nama_wali // Kirim nama juga biar bisa nampilin "Selamat datang, Bapak Budi"
        });

    } catch (err) {
        console.error('Error login orang tua:', err);
        res.status(500).send({ message: 'Terjadi error di server' });
    }
});

// ENDPOINT BARU: ORTU "LINK" ANAK
// ===================================
app.post('/api/orangtua/link-anak', authenticateToken('orangtua'), async (req, res) => {
    // 1. Ambil ID orang tua DARI TOKEN
    const idOrangTua = req.user.id_orang_tua;
    
    // 2. Ambil kode link dari body
    const { kode_link } = req.body;
    if (!kode_link) {
        return res.status(400).json({ message: 'Kode link anak wajib diisi.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 3. Cari siswa pake kode link
        const queryText = 'SELECT id, nama_siswa, orang_tua_id FROM Siswa WHERE kode_link_ortu = $1';
        const dbRes = await client.query(queryText, [kode_link.toUpperCase()]); // (Kita pake UPPERCASE)

        if (dbRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).send({ message: 'Kode link tidak valid atau tidak ditemukan.' });
        }
        
        const siswa = dbRes.rows[0];

        // 4. Cek kalo anaknya udah di-link
        if (siswa.orang_tua_id) {
            await client.query('ROLLBACK');
            return res.status(400).send({ message: `Siswa "${siswa.nama_siswa}" sudah terhubung ke akun wali lain.` });
        }

        // 5. KALO AMAN: Sambungin!
        const updateQuery = `
            UPDATE Siswa 
            SET orang_tua_id = $1, kode_link_ortu = NULL -- Hapus kodenya biar nggak dipake lagi
            WHERE id = $2
            RETURNING *;
        `;
        await client.query(updateQuery, [idOrangTua, siswa.id]);

        await client.query('COMMIT');
        
        res.status(200).send({ message: `Sukses! Akun Anda berhasil terhubung dengan siswa "${siswa.nama_siswa}".` });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error link anak:', err);
        res.status(500).json({ message: 'Terjadi error di server.' });
    } finally {
        client.release();
    }
});

// ENDPOINT 26: LIHAT LAPORAN (KHUSUS ORTU)
// ===================================
app.get('/api/orangtua/laporan-saya', authenticateToken('orangtua'), async (req, res) => {
    
    // 1. Ambil ID orang tua DARI TOKEN (Otomatis & Aman)
    const idOrangTua = req.user.id_orang_tua; 

    // 2. Ambil query bulan & tahun dari URL (cth: ...?bulan=11&tahun=2025)
    const { bulan, tahun } = req.query;
    if (!bulan || !tahun) {
        return res.status(400).send({ message: 'Bulan dan tahun wajib diisi.' });
    }

    const client = await pool.connect();
    try {
        // 3. Cari SEMUA anak yang nyambung ke ID orang tua ini
        const siswaRes = await client.query(
            'SELECT id, nama_siswa, kelas_id FROM Siswa WHERE orang_tua_id = $1', 
            [idOrangTua]
        );
        
        const daftarAnak = siswaRes.rows;
        if (daftarAnak.length === 0) {
            return res.status(404).send({ message: 'Tidak ada data siswa yang terhubung dengan akun ini.' });
        }
        const daftarIdAnak = daftarAnak.map(anak => anak.id);

        // 4. Ambil total hari aktif
        const hariAktifRes = await client.query(
            'SELECT total_hari FROM HariAktif WHERE bulan = $1 AND tahun = $2',
            [bulan, tahun]
        );
        // Kalo admin belum nentuin, kita pake default 21 hari
        let total_hari_aktif = hariAktifRes.rows.length > 0 ? hariAktifRes.rows[0].total_hari : 21; 

        // 5. Ambil semua log absensi HANYA UNTUK ANAK DIA di bulan/tahun itu
        const logRes = await client.query(
            `SELECT siswa_id, timestamp_masuk, status_manual 
             FROM AbsensiLog 
             WHERE siswa_id = ANY($1::int[]) -- <-- Query canggih buat nyari di array ID
               AND EXTRACT(MONTH FROM tanggal) = $2
               AND EXTRACT(YEAR FROM tanggal) = $3`,
            [daftarIdAnak, bulan, tahun]
        );
        const daftarLogBulanIni = logRes.rows;

        // 6. Proses datanya (Mirip Laporan Bulanan, tapi di-loop per anak)
        const rekapitulasi_anak = daftarAnak.map(anak => {
            const logSiswaIni = daftarLogBulanIni.filter(log => log.siswa_id === anak.id);
            
            let total_hadir = 0;
            let total_sakit = 0;
            let total_izin = 0;

            logSiswaIni.forEach(log => {
                if (log.timestamp_masuk) total_hadir++;
                else if (log.status_manual === 'Sakit') total_sakit++;
                else if (log.status_manual === 'Izin') total_izin++;
            });
            
            // Hitung Alfa (Tidak Hadir)
            const total_tidak_hadir = total_hari_aktif - (total_hadir + total_sakit + total_izin);
            // Pake fungsi 'buatKesimpulan' yang udah ada di atas
            const kesimpulan_individu = buatKesimpulan(total_hadir, total_izin, total_sakit, total_tidak_hadir, total_hari_aktif);

            return {
                id_siswa: anak.id,
                nama: anak.nama_siswa,
                total_hadir,
                total_izin,
                total_sakit,
                total_tidak_hadir,
                kesimpulan_individu
            };
        });

        // 7. Kirim datanya
        res.status(200).send({
            bulan: bulan,
            tahun: tahun,
            total_hari_aktif: total_hari_aktif,
            data_anak: rekapitulasi_anak // Kirim array (walaupun mungkin cuma 1 anak)
        });

    } catch (err) {
        console.error('Error ambil laporan ortu:', err);
        res.status(500).send({ message: 'Terjadi error di server' });
    } finally {
        client.release();
    }
});

// ENDPOINT 27: DOWNLOAD ZIP (VERSI BACKEND)
// ===================================
app.get('/api/qr/zip-by-kelas/:kelasId', authenticateToken('operator'), async (req, res) => {
    const { kelasId } = req.params;

    if (!kelasId) {
        return res.status(400).json({ message: 'Class ID is required' });
    }

    try {
        // 1. Ambil data siswa di kelas itu (sama kayak API 'by-kelas')
        const queryText = `
            SELECT s.id, s.kode_unik_siswa, s.nama_siswa, k.nama_kelas
            FROM Siswa s
            LEFT JOIN Kelas k ON s.kelas_id = k.id
            WHERE s.kelas_id = $1
            ORDER BY s.nama_siswa;
        `;
        const dbRes = await pool.query(queryText, [kelasId]);
        const daftarSiswa = dbRes.rows;

        if (daftarSiswa.length === 0) {
            return res.status(404).send({ message: 'Tidak ada siswa di kelas ini.' });
        }

        // 2. Siapin mesin ZIP
        const zip = new JSZip();

        // 3. Loop & Bikin QR di server
        for (const siswa of daftarSiswa) {
            // 3a. Generate QR code-nya
            const qrDataUrl = await qrcode.toDataURL(siswa.kode_unik_siswa, { width: 300 });
            
            // 3b. Ambil data 'base64'-nya aja
            const base64Data = qrDataUrl.split(',')[1];
            
            // 3c. Masukin ke ZIP
            const namaFile = `${siswa.nama_siswa} (${siswa.kode_unik_siswa}).png`;
            zip.file(namaFile, base64Data, { base64: true });
        }

        // 4. Generate file .zip-nya sebagai 'nodebuffer'
        const content = await zip.generateAsync({ 
            type: 'nodebuffer',
            compression: 'DEFLATE',
            compressionOptions: {
                level: 9 // Kompresi maksimal
            }
        });
        
        // 5. Siapin nama file download-nya
        const namaKelas = daftarSiswa[0].nama_kelas || 'Siswa';
        const namaFileZip = `QR_Siswa_${namaKelas.replace(/ /g, '_')}.zip`;

        // 6. Kirim file-nya ke frontend
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename=${namaFileZip}`);
        res.send(content);

    } catch (err) {
        console.error('Error bikin zip di backend:', err);
        res.status(500).json({ message: 'Gagal membuat file .zip di server.' });
    }
});

// ENDPOINT 28: CARI AKUN ORANG TUA (BY NAMA)
// ===================================
app.get('/api/orangtua/search', authenticateToken('operator'), async (req, res) => {
    // Kita nyari pake query param (cth: /api/orangtua/search?nama=budi)
    const { nama } = req.query;

    if (!nama) {
        return res.status(400).json({ message: 'Nama pencarian wajib diisi.' });
    }

    try {
        // Kita pake 'ILIKE' biar (Budi, budi, BUDI) semua kena
        // Kita pake '%' biar 'budi' bisa nemu 'Bapak Budi'
        const queryText = `
            SELECT id, nama_wali, username 
            FROM OrangTua 
            WHERE nama_wali ILIKE $1
            ORDER BY nama_wali
            LIMIT 10; 
        `;
        
        const dbRes = await pool.query(queryText, [`%${nama}%`]); 

        res.status(200).send(dbRes.rows);

    } catch (err) {
        console.error('Error search orang tua:', err);
        res.status(500).json({ message: 'Gagal mencari data orang tua.' });
    }
});

// ENDPOINT 29: GET SEMUA AKUN ORTU
// ===================================
app.get('/api/orangtua', authenticateToken('operator'), async (req, res) => {
    try {
        // Ambil semua ortu, KECUALI password hash-nya
        const queryText = `
    SELECT 
        o.id, 
        o.nama_wali, 
        o.username,
        o.email,
        -- Menggabungkan semua nama siswa jadi satu string, dipisah koma
        -- Kalo nggak ada, tampilkan 'Belum terhubung'
        COALESCE(STRING_AGG(s.nama_siswa, ', '), 'Belum terhubung') AS anak_terhubung
    FROM 
        OrangTua o
    LEFT JOIN 
        Siswa s ON o.id = s.orang_tua_id
    GROUP BY 
        o.id, o.nama_wali, o.username, o.email
    ORDER BY 
        o.nama_wali ASC;
`;
        const dbRes = await pool.query(queryText); 
        res.status(200).send(dbRes.rows);
    } catch (err) {
        console.error('Error get semua ortu:', err);
        res.status(500).json({ message: 'Gagal memuat data orang tua.' });
    }
});

// ENDPOINT 35: ORTU GANTI PASSWORD SENDIRI
// ===================================
app.put('/api/orangtua/ganti-password', authenticateToken('orangtua'), async (req, res) => {
    
    // 1. Ambil ID orang tua DARI TOKEN (Aman)
    const idOrangTua = req.user.id_orang_tua; 
    
    // 2. Ambil password lama & baru dari body
    const { password_lama, password_baru } = req.body;
    if (!password_lama || !password_baru) {
        return res.status(400).json({ message: 'Password lama dan password baru wajib diisi.' });
    }
    
    if (password_baru.length < 6) {
        return res.status(400).json({ message: 'Password baru minimal 6 karakter.' });
    }

    const client = await pool.connect();
    try {
        // 3. Cek dulu password lamanya bener nggak
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

        // 4. Kalo password lama bener, hash password baru
        const saltRounds = 10;
        const password_hash_baru = await bcrypt.hash(password_baru, saltRounds);
        
        // 5. Update ke database
        const updateQuery = 'UPDATE OrangTua SET password_hash = $1 WHERE id = $2';
        await client.query(updateQuery, [password_hash_baru, idOrangTua]);
        
        res.status(200).send({ message: 'Password Anda berhasil di-update!' });

    } catch (err) {
        console.error('Error ganti password ortu:', err);
        res.status(500).json({ message: 'Gagal meng-update password.' });
    } finally {
        client.release();
    }
});

// ENDPOINT 30: EDIT AKUN ORTU (NAMA & USERNAME)
// ===================================
app.put('/api/orangtua/:id', authenticateToken('operator'), async (req, res) => {
    const { id } = req.params;
    const { nama_wali, username, email } = req.body;

    if (!nama_wali || !username || !email) {
        return res.status(400).json({ message: 'Nama wali dan username wajib diisi.' });
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
        // Kalo username-nya nabrak
        if (err.code === '23505') { 
            return res.status(400).send({ message: 'Error: Username itu sudah dipakai.' });
        }
        console.error('Error update ortu:', err);
        res.status(500).json({ message: 'Gagal meng-update akun.' });
    }
});

// ENDPOINT 31: HAPUS AKUN ORTU
// ===================================
app.delete('/api/orangtua/:id', authenticateToken('operator'), async (req, res) => {
    const { id } = req.params;

    // PENTING: Waktu ortu dihapus, kolom 'orang_tua_id' di tabel Siswa
    // otomatis jadi NULL (karena kita set 'ON DELETE SET NULL' di database).
    // Jadi kita nggak perlu 'BEGIN'/'COMMIT'
    
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
});

// ENDPOINT 32: RESET PASSWORD ORTU (VERSI BARU, GENERATE OTOMATIS)
// ===================================
app.put('/api/orangtua/reset-password/:id', authenticateToken('operator'), async (req, res) => {
    const { id } = req.params;
    
    // 1. Generate password baru acak
    // (Biar gampang, kita bikin password simpel 'tkbaru' + 3 angka acak)
    const password_baru_acak = 'tkbaru' + Math.floor(100 + Math.random() * 900);

    try {
        // 2. Hash password baru
        const saltRounds = 10;
        const password_hash_baru = await bcrypt.hash(password_baru_acak, saltRounds);

        // 3. Update ke database
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
        
        // 4. Kirim balik PASSWORD-nya (YANG BELUM DI-HASH) ke admin
        res.status(200).send({ 
            message: `Password untuk "${dbRes.rows[0].nama_wali}" berhasil di-reset!`,
            password_baru: password_baru_acak // <-- KIRIM BALIK INI
        });

    } catch (err) {
        console.error('Error reset password ortu:', err);
        res.status(500).json({ message: 'Gagal me-reset password.' });
    }
});

// ENDPOINT 33: DETAIL LAPORAN PER ANAK (KHUSUS ORTU)
// ===================================
app.get('/api/orangtua/laporan-detail', authenticateToken('orangtua'), async (req, res) => {
    
    // 1. Ambil ID orang tua DARI TOKEN (Aman)
    const idOrangTua = req.user.id_orang_tua; 

    // 2. Ambil query params (anak siapa, bulan apa, tahun apa)
    const { siswa_id, bulan, tahun } = req.query;
    if (!siswa_id || !bulan || !tahun) {
        return res.status(400).send({ message: 'Siswa ID, bulan, dan tahun wajib diisi.' });
    }

    const client = await pool.connect();
    try {
        // 3. [SECURITY CHECK] 
        // Cek dulu, ini beneran anaknya dia bukan?
        const cekAnakQuery = 'SELECT id FROM Siswa WHERE id = $1 AND orang_tua_id = $2';
        const cekAnakRes = await client.query(cekAnakQuery, [siswa_id, idOrangTua]);
        
        if (cekAnakRes.rows.length === 0) {
            // Kalo bukan, tolak!
            return res.status(403).send({ message: 'Akses ditolak. Ini bukan data anak Anda.' });
        }
        
        // 4. [LOGIKA BARU] Ambil SEMUA TANGGAL di bulan itu
        // Kita butuh fungsi 'generate_series' dari PostgreSQL
        // buat bikin daftar tanggal dari tgl 1 s/d 28/29/30/31
        const queryText = `
            WITH TANGGAL_BULAN_INI AS (
                SELECT generate_series(
                    -- Tanggal 1 di bulan itu
                    make_date($1, $2, 1), 
                    -- Tanggal terakhir di bulan itu
                    (make_date($1, $2, 1) + interval '1 month - 1 day')::date,
                    interval '1 day'
                )::date AS tanggal
            )
            -- 5. LEFT JOIN tanggal itu dengan log absen
            SELECT 
                t.tanggal,
                COALESCE(a.status_manual, 
                    CASE 
                        WHEN a.timestamp_masuk IS NOT NULL THEN 'Hadir'
                        ELSE 'Alfa' -- Kalo nggak ada data & bukan tgl merah = Alfa
                    END
                ) AS status,
                a.alasan
            FROM 
                TANGGAL_BULAN_INI t
            LEFT JOIN 
                AbsensiLog a ON t.tanggal = a.tanggal AND a.siswa_id = $3
            ORDER BY 
                t.tanggal ASC;
        `;
        
        // (Catatan: Logika 'Alfa' di atas belum ngitung 'Hari Aktif'.
        //  Biar gampang, kita kirim aja semua log-nya)
        
        // [UPDATE] Logika lebih simpel: Kirim aja log yang ada
        const simpleQuery = `
            SELECT 
                tanggal, 
                status_manual, 
                timestamp_masuk,
                alasan
            FROM AbsensiLog
            WHERE siswa_id = $1
              AND EXTRACT(MONTH FROM tanggal) = $2
              AND EXTRACT(YEAR FROM tanggal) = $3
            ORDER BY tanggal ASC;
        `;
        
        const dbRes = await client.query(simpleQuery, [siswa_id, bulan, tahun]);

        // 6. Format datanya biar rapi
        const detailLaporan = dbRes.rows.map(log => {
            let status = 'Alfa'; // Default
            if (log.timestamp_masuk) {
                status = 'Hadir';
            } else if (log.status_manual) {
                status = log.status_manual; // 'Izin' atau 'Sakit'
            }
            
            return {
                tanggal: new Date(log.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }),
                status: status,
                alasan: log.alasan || '-'
            };
        });

        res.status(200).send(detailLaporan);

    } catch (err) {
        console.error('Error ambil detail laporan ortu:', err);
        res.status(500).send({ message: 'Terjadi error di server' });
    } finally {
        client.release();
    }
});

// ENDPOINT 34: DAPETIN STATISTIK DASHBOARD
// ===================================
app.get('/api/stats/dashboard', authenticateToken('operator'), async (req, res) => {
    
    try {
        // Kita siapin 3 query
        const siswaQuery = 'SELECT COUNT(*) AS total_siswa FROM Siswa';
        const kelasQuery = 'SELECT COUNT(*) AS total_kelas FROM Kelas';
        const ortuQuery = 'SELECT COUNT(*) AS total_ortu FROM OrangTua';

        // Kita jalanin 3 query-nya sekaligus biar cepet (Promise.all)
        const [siswaRes, kelasRes, ortuRes] = await Promise.all([
            pool.query(siswaQuery),
            pool.query(kelasQuery),
            pool.query(ortuQuery)
        ]);

        // Ambil angkanya
        const stats = {
            // .rows[0].total_siswa dapetnya string, kita ubah jadi angka pake parseInt
            total_siswa: parseInt(siswaRes.rows[0].total_siswa, 10),
            total_kelas: parseInt(kelasRes.rows[0].total_kelas, 10),
            total_ortu: parseInt(ortuRes.rows[0].total_ortu, 10)
        };
        
        // Kirim balik sebagai 1 objek JSON
        res.status(200).json(stats);

    } catch (err) {
        console.error('Error get dashboard stats:', err);
        res.status(500).json({ message: 'Gagal memuat statistik.' });
    }
});

// ENDPOINT 36: LUPA PASSWORD (ORTU)
// ===================================
app.post('/api/orangtua/lupa-password', async (req, res) => {
    // Ortu bisa masukin email ATAU username
    const { usernameAtauEmail } = req.body;

    if (!usernameAtauEmail) {
        return res.status(400).json({ message: 'Username atau Email wajib diisi.' });
    }

    const client = await pool.connect();
    try {
        // 1. Cari ortu berdasarkan username ATAU email
        const queryText = `
            SELECT id, nama_wali, username, email 
            FROM OrangTua 
            WHERE username = $1 OR email = $1
        `;
        const dbRes = await client.query(queryText, [usernameAtauEmail]);

        if (dbRes.rows.length === 0) {
            // JANGAN BILANG "Tidak ditemukan".
            // Biar aman, kita pura-pura sukses aja.
            return res.status(200).send({ message: 'Jika akun Anda terdaftar, email reset password akan dikirim.' });
        }
        
        const ortu = dbRes.rows[0];
        if (!ortu.email) {
            // Kalo ortunya ada tapi emailnya KOSONG
            return res.status(400).send({ message: 'Akun ini belum terdaftar email. Hubungi operator.' });
        }

        // 2. Kalo ketemu, bikin password baru
        const password_baru_acak = 'tkbaru' + Math.floor(100 + Math.random() * 900);
        
        // 3. Hash password baru
        const saltRounds = 10;
        const password_hash_baru = await bcrypt.hash(password_baru_acak, saltRounds);

        // 4. Update ke database
        await client.query('UPDATE OrangTua SET password_hash = $1 WHERE id = $2', [password_hash_baru, ortu.id]);
        
        // 5. Kirim email pake Nodemailer
        await transporter.sendMail({
            from: '"Admin Absensi TK" <email.gmail.lo@gmail.com>', // <-- GANTI INI
            to: ortu.email, // Email ortu dari database
            subject: 'Reset Password Akun Wali Murid',
            html: `
                <h3>Halo ${ortu.nama_wali},</h3>
                <p>Anda telah meminta reset password. Akun Anda (<b>${ortu.username}</b>) telah di-reset.</p>
                <p>Password baru Anda adalah: <h2>${password_baru_acak}</h2></p>
                <p>Silakan segera login dan ganti password Anda di menu "Ganti Password".</p>
                <p>Terima kasih.</p>
            `
        });

        // 6. Kirim respon sukses
        res.status(200).send({ message: 'Email reset password telah dikirim ke email Anda.' });

    } catch (err) {
        console.error('Error lupa password ortu:', err);
        res.status(500).json({ message: 'Terjadi error di server.' });
    } finally {
        client.release();
    }
});

// 6. Jalankan Server
app.listen(port, '0.0.0.0', () => {
    console.log(`Server berjalan di port ${port}`);

    // Coba tes koneksi database saat server start
    pool.query('SELECT NOW()', (err, res) => {
        if (err) {
            console.error('Error koneksi ke database:', err);
        } else {
            console.log('Sukses terhubung ke database PostgreSQL! Waktu DB:', res.rows[0].now);
        }
    });
});
const express = require('express');
const router = express.Router();

const db = require('../db/connection');

const { auth } = require('../middleware/auth');

const multer = require('multer');

const path = require('path');

const fs = require('fs');


// ======================================================
// CREATE UPLOAD FOLDER
// ======================================================

const uploadDir = path.join(
  __dirname,
  '../../uploads/samples'
);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true,
  });
}

// ======================================================
// MULTER CONFIG
// ======================================================

const storage = multer.diskStorage({

  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {

    const ext = path
      .extname(file.originalname)
      .toLowerCase();

    const uniqueName =
      `sample_${Date.now()}_${Math.round(
        Math.random() * 1000
      )}${ext}`;

    cb(null, uniqueName);
  },
});

const fileFilter = (
  req,
  file,
  cb
) => {

  const allowed = [
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.gif',
  ];

  const ext = path
    .extname(file.originalname)
    .toLowerCase();

  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        'Only JPG, PNG, WEBP, GIF images allowed'
      )
    );
  }
};

const upload = multer({

  storage,

  fileFilter,

  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

// ======================================================
// GET ALL SAMPLE REQUESTS (role-based)
// ======================================================
// FIX: Treat 'employee' as a staff role, same as 'admin'. Sample requests /
// the Analysis Pipeline is shared internal production data — employees with
// module access should see all requests, not be scoped to a customer_id
// they don't have (that field only exists on client/customer-portal JWTs).
// Previously employees fell into the "else" branch, req.user.customer_id
// was undefined, the WHERE clause matched zero rows, and the table silently
// rendered "No sample requests found" with no error.

router.get(
  '/',
  auth,
  async (req, res) => {

    try {

      let rows;

      if (req.user.role === 'admin' || req.user.role === 'employee') {

        // Staff (admin + employee) see everything

        const [data] = await db.query(
          `SELECT sr.*, c.customer_name, c.customer_id AS cust_code
           FROM sample_requests sr
           LEFT JOIN customers c ON sr.customer_id = c.customer_id
           ORDER BY sr.created_at DESC`
        );

        rows = data;

      } else {

        // Client sees ONLY their own records
        // req.user.customer_id comes from the JWT payload

        const [data] = await db.query(
          `SELECT sr.*, c.customer_name, c.customer_id AS cust_code
           FROM sample_requests sr
           LEFT JOIN customers c ON sr.customer_id = c.customer_id
           WHERE sr.customer_id = ?
           ORDER BY sr.created_at DESC`,
          [req.user.customer_id]
        );

        rows = data;
      }

      res.json(rows);

    } catch (err) {

      console.error(
        '[GET SAMPLE REQUESTS]',
        err
      );

      res.status(500).json({
        message: 'Failed to fetch sample requests',
      });
    }
  }
);


// ======================================================
// CREATE SAMPLE REQUEST
// ======================================================

router.post(
  '/',
  auth,
  upload.single('image'),
  async (req, res) => {

    try {

      const {

        request_code,

        customer_name,
        customer_id,
        agent_name,

        sample_type,

        fabric_code,
        fabric_quality,

        color,

        quantity_meters,

        customer_comments,

        status,

      } = req.body;

      // =====================================
      // VALIDATION
      // =====================================

      if (
        !request_code ||
        !customer_name
      ) {

        if (req.file) {
          fs.unlinkSync(req.file.path);
        }

        return res.status(400).json({
          message:
            'request_code and customer_name are required',
        });
      }

      // =====================================
      // IMAGE URL
      // =====================================

      const image_url = req.file
        ? `/uploads/samples/${req.file.filename}`
        : null;

      // =====================================
      // QUANTITY
      // =====================================

      const qty =
        quantity_meters === '' ||
        quantity_meters == null
          ? null
          : parseFloat(quantity_meters);

      // =====================================
      // INSERT
      // =====================================

      const [result] =
        await db.query(

          `
          INSERT INTO sample_requests (

            request_code,

            customer_name,
            customer_id,
            agent_name,

            sample_type,

            fabric_code,
            fabric_quality,

            color,

            quantity_meters,

            customer_comments,

            status,

            image_url

          )
          VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          )
          `,

          [

            String(request_code).trim(),

            String(customer_name).trim(),

            customer_id
              ? String(customer_id).trim()
              : null,

            agent_name
              ? String(agent_name).trim()
              : null,

            sample_type || 'whatsapp',

            fabric_code
              ? String(fabric_code).trim()
              : null,

            fabric_quality
              ? String(fabric_quality).trim()
              : null,

            color
              ? String(color).trim()
              : null,

            isNaN(qty)
              ? null
              : qty,

            customer_comments
              ? String(customer_comments).trim()
              : null,

            status || 'pending',

            image_url,
          ]
        );

      res.status(201).json({

        message:
          'Sample request created',

        id: result.insertId,

        image_url,
      });

    } catch (err) {

      if (
        req.file &&
        fs.existsSync(req.file.path)
      ) {
        fs.unlinkSync(req.file.path);
      }

      console.error(
        '[CREATE SAMPLE ERROR]',
        err
      );

      if (
        err.code === 'ER_DUP_ENTRY'
      ) {

        return res.status(409).json({
          message:
            'Request code already exists',
        });
      }

      res.status(500).json({
        message: err.message,
      });
    }
  }
);

// ======================================================
// UPDATE SAMPLE REQUEST
// ======================================================

router.put(
  '/:id',
  auth,
  upload.single('image'),
  async (req, res) => {

    try {

      const id = parseInt(
        req.params.id,
        10
      );

      if (!id) {

        return res.status(400).json({
          message: 'Invalid ID',
        });
      }

      const {

        customer_name,
        customer_id,
        agent_name,

        sample_type,

        fabric_code,
        fabric_quality,

        color,

        quantity_meters,

        customer_comments,

        status,

      } = req.body;

      // =====================================
      // CHECK RECORD
      // =====================================

      const [check] =
        await db.query(
          `
          SELECT *
          FROM sample_requests
          WHERE id = ?
          `,
          [id]
        );

      if (!check.length) {

        if (req.file) {
          fs.unlinkSync(req.file.path);
        }

        return res.status(404).json({
          message:
            'Sample request not found',
        });
      }

      // =====================================
      // IMAGE UPDATE
      // =====================================

      let image_url =
        check[0].image_url;

      // NEW IMAGE

      if (req.file) {

        // delete old image

        if (image_url) {

          const oldPath =
            path.join(
              __dirname,
              '../../',
              image_url
            );

          if (
            fs.existsSync(oldPath)
          ) {
            fs.unlinkSync(oldPath);
          }
        }

        image_url =
          `/uploads/samples/${req.file.filename}`;
      }

      // REMOVE IMAGE

      if (
        req.body.remove_image ===
          'true' &&
        image_url &&
        !req.file
      ) {

        const oldPath =
          path.join(
            __dirname,
            '../../',
            image_url
          );

        if (
          fs.existsSync(oldPath)
        ) {
          fs.unlinkSync(oldPath);
        }

        image_url = null;
      }

      // =====================================
      // QUANTITY
      // =====================================

      const qty =
        quantity_meters === '' ||
        quantity_meters == null
          ? null
          : parseFloat(quantity_meters);

      // =====================================
      // UPDATE
      // =====================================

      await db.query(

        `
        UPDATE sample_requests

        SET

          customer_name     = ?,
          customer_id       = ?,

          agent_name        = ?,

          sample_type       = ?,

          fabric_code       = ?,
          fabric_quality    = ?,

          color             = ?,

          quantity_meters   = ?,

          customer_comments = ?,

          status            = ?,

          image_url         = ?

        WHERE id = ?
        `,

        [

          String(customer_name).trim(),

          customer_id
            ? String(customer_id).trim()
            : null,

          agent_name
            ? String(agent_name).trim()
            : null,

          sample_type || 'whatsapp',

          fabric_code
            ? String(fabric_code).trim()
            : null,

          fabric_quality
            ? String(fabric_quality).trim()
            : null,

          color
            ? String(color).trim()
            : null,

          isNaN(qty)
            ? null
            : qty,

          customer_comments
            ? String(customer_comments).trim()
            : null,

          status || 'pending',

          image_url,

          id,
        ]
      );

      res.json({
        message:
          'Sample request updated',
        image_url,
      });

    } catch (err) {

      if (
        req.file &&
        fs.existsSync(req.file.path)
      ) {
        fs.unlinkSync(req.file.path);
      }

      console.error(
        '[UPDATE SAMPLE ERROR]',
        err
      );

      res.status(500).json({
        message: err.message,
      });
    }
  }
);

// ======================================================
// DELETE SAMPLE REQUEST
// ======================================================

router.delete(
  '/:id',
  auth,
  async (req, res) => {

    try {

      const id = parseInt(
        req.params.id,
        10
      );

      if (!id) {

        return res.status(400).json({
          message: 'Invalid ID',
        });
      }

      // =====================================
      // CHECK
      // =====================================

      const [check] =
        await db.query(
          `
          SELECT *
          FROM sample_requests
          WHERE id = ?
          `,
          [id]
        );

      if (!check.length) {

        return res.status(404).json({
          message:
            'Sample request not found',
        });
      }

      // =====================================
      // DELETE IMAGE
      // =====================================

      if (check[0].image_url) {

        const imagePath =
          path.join(
            __dirname,
            '../../',
            check[0].image_url
          );

        if (
          fs.existsSync(imagePath)
        ) {
          fs.unlinkSync(imagePath);
        }
      }

      // =====================================
      // DELETE RECORD
      // =====================================

      await db.query(
        `
        DELETE FROM sample_requests
        WHERE id = ?
        `,
        [id]
      );

      res.json({
        message:
          'Sample request deleted',
      });

    } catch (err) {

      console.error(
        '[DELETE SAMPLE ERROR]',
        err
      );

      res.status(500).json({
        message: err.message,
      });
    }
  }
);

module.exports = router;
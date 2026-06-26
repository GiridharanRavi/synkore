-- ============================================================
-- COMBINED FABRIC FLOW DATABASE SCHEMA
-- ============================================================

CREATE DATABASE IF NOT EXISTS fabricflow;
USE fabricflow;

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin','client') DEFAULT 'client',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. SAMPLE REQUESTS
CREATE TABLE IF NOT EXISTS sample_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_code VARCHAR(50) UNIQUE NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  fabric_type VARCHAR(255) NOT NULL,
  color_reference VARCHAR(255),
  quantity_meters DECIMAL(10,2),
  description TEXT,
  request_date DATE,
  status ENUM('pending','development_analysis', 'submitted', 'approved', 'rejected', 'rework') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 3. DEVELOPMENT ANALYSIS (GREY)
CREATE TABLE IF NOT EXISTS development_analysis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sample_request_id INT NOT NULL,
  analyst_name VARCHAR(255),
  grey_fabric_type VARCHAR(255),
  analysis_notes TEXT,
  result ENUM('approved','rejected') DEFAULT 'approved',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sample_request_id) REFERENCES sample_requests(id) ON DELETE CASCADE
);

-- 4. SUBMISSIONS
CREATE TABLE IF NOT EXISTS submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sample_request_id INT NOT NULL,
  submission_date DATE NOT NULL,
  submitted_by VARCHAR(255),
  comments TEXT,
  status ENUM('pending','approved','rework') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sample_request_id) REFERENCES sample_requests(id) ON DELETE CASCADE
);

-- 5. ORDER BOOKINGS
CREATE TABLE IF NOT EXISTS order_bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_code VARCHAR(50) UNIQUE NOT NULL,
  sample_request_id INT,
  client_name VARCHAR(255) NOT NULL,
  booking_type ENUM('with_sample','without_sample') NOT NULL,
  fabric_type VARCHAR(255) NOT NULL,
  color VARCHAR(255),
  quantity_meters DECIMAL(10,2) NOT NULL,
  delivery_date DATE,
  status ENUM('booked','inward','job_work','outward','dyeing','processing','dispatched') DEFAULT 'booked',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (sample_request_id) REFERENCES sample_requests(id) ON DELETE SET NULL
);

-- 6. INWARD / INWARD ENTRIES
CREATE TABLE IF NOT EXISTS inward (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_booking_id INT NOT NULL,
  lot_no VARCHAR(50),
  fabric_type VARCHAR(100),
  quantity DECIMAL(10,2),
  received_date DATE,
  received_by VARCHAR(255),
  stage ENUM('sample_inward','bulk_inward') DEFAULT 'bulk_inward',
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_booking_id) REFERENCES order_bookings(id) ON DELETE CASCADE
);

-- 7. JOB WORK ORDERS
CREATE TABLE IF NOT EXISTS job_work (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_code VARCHAR(50) UNIQUE NOT NULL,
  order_booking_id INT NOT NULL,
  job_type VARCHAR(100),
  issued_date DATE,
  issued_by VARCHAR(255),
  assigned_to VARCHAR(150),
  due_date DATE,
  process_type VARCHAR(255),
  instructions TEXT,
  status ENUM('open','outward','processing','completed') DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_booking_id) REFERENCES order_bookings(id) ON DELETE CASCADE
);

-- 8. OUTWARD (To Vendor)
CREATE TABLE IF NOT EXISTS outward (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_work_id INT NOT NULL,
  lot_no VARCHAR(50),
  vendor_name VARCHAR(255),
  quantity DECIMAL(10,2),
  outward_date DATE,
  destination VARCHAR(200),
  challan_number VARCHAR(100),
  status VARCHAR(50) DEFAULT 'pending',
  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_work_id) REFERENCES job_work(id) ON DELETE CASCADE
);

-- 9. DYEING & PROCESSING
CREATE TABLE IF NOT EXISTS dyeing (
  id INT AUTO_INCREMENT PRIMARY KEY,
  outward_id INT NOT NULL,
  dye_lot_number VARCHAR(100),
  color VARCHAR(100),
  process_type ENUM('dyeing','printing','finishing','other') DEFAULT 'dyeing',
  shade_reference VARCHAR(255),
  start_date DATE,
  end_date DATE,
  status ENUM('pending','in_progress','completed','failed') DEFAULT 'pending',
  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (outward_id) REFERENCES outward(id) ON DELETE CASCADE
);

-- 10. INWARD PROCESSED (Fabric returned after processing)
CREATE TABLE IF NOT EXISTS inward_processed (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dyeing_id INT NOT NULL,
  process_type VARCHAR(100),
  received_date DATE,
  quantity_received DECIMAL(10,2),
  quality_check ENUM('pass','fail','conditional') DEFAULT 'pass',
  qc_notes TEXT,
  received_by VARCHAR(255),
  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dyeing_id) REFERENCES dyeing(id) ON DELETE CASCADE
);

-- 11. FINAL DISPATCH
CREATE TABLE IF NOT EXISTS dispatch (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dispatch_code VARCHAR(50) UNIQUE NOT NULL,
  inward_processed_id INT NOT NULL,
  lot_no VARCHAR(50),
  quantity DECIMAL(10,2),
  dispatch_date DATE,
  dispatched_by VARCHAR(255),
  transporter_name VARCHAR(255),
  lr_number VARCHAR(100),
  destination VARCHAR(200),
  status VARCHAR(50) DEFAULT 'pending',
  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inward_processed_id) REFERENCES inward_processed(id) ON DELETE CASCADE
);

-- ----------------------------
-- SAMPLE SEED DATA
-- ----------------------------
INSERT INTO sample_requests (request_code, client_name, fabric_type, color_reference, quantity_meters, status) VALUES
('SR-2024-001', 'Textiles India Ltd', 'Cotton Twill', 'Pantone 18-1660', 200, 'approved'),
('SR-2024-002', 'Fashion Forward', 'Silk Satin', 'Navy Blue', 100, 'pending');

INSERT INTO order_bookings (order_code, sample_request_id, client_name, booking_type, fabric_type, color, quantity_meters, delivery_date, status) VALUES
('OB-2024-001', 1, 'Textiles India Ltd', 'with_sample', 'Cotton Twill', 'Red', 500, '2024-12-31', 'inward');
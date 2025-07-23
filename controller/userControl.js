-- Users table
CREATE TABLE users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('student', 'instructor', 'admin') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Categories table
CREATE TABLE categories (
    category_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Courses table
CREATE TABLE courses (
    course_id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    instructor_id INT NOT NULL,
    category_id INT NOT NULL,
    price DECIMAL(10,2) DEFAULT 0.00,
    is_free BOOLEAN DEFAULT FALSE,
    image_url VARCHAR(255),
    average_rating DECIMAL(3,2) DEFAULT 0.00,
    total_students INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (instructor_id) REFERENCES users(user_id),
    FOREIGN KEY (category_id) REFERENCES categories(category_id)
);

-- Sections table
CREATE TABLE sections (
    section_id INT PRIMARY KEY AUTO_INCREMENT,
    course_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    order_index INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE
);

-- Lectures table
CREATE TABLE lectures (
    lecture_id INT PRIMARY KEY AUTO_INCREMENT,
    section_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    video_url VARCHAR(255),
    duration INT, -- in seconds
    order_index INT NOT NULL,
    is_preview BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (section_id) REFERENCES sections(section_id) ON DELETE CASCADE
);

-- Enrollments table
CREATE TABLE enrollments (
    enrollment_id INT PRIMARY KEY AUTO_INCREMENT,
    student_id INT NOT NULL,
    course_id INT NOT NULL,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (student_id) REFERENCES users(user_id),
    FOREIGN KEY (course_id) REFERENCES courses(course_id),
    UNIQUE (student_id, course_id)
);

-- Payments table
CREATE TABLE payments (
    payment_id INT PRIMARY KEY AUTO_INCREMENT,
    enrollment_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(50),
    transaction_id VARCHAR(100),
    status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (enrollment_id) REFERENCES enrollments(enrollment_id)
);

-- Reviews table
CREATE TABLE reviews (
    review_id INT PRIMARY KEY AUTO_INCREMENT,
    course_id INT NOT NULL,
    student_id INT NOT NULL,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(course_id),
    FOREIGN KEY (student_id) REFERENCES users(user_id),
    UNIQUE (student_id, course_id)
);


// server.js
const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 5000;

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// Middleware
app.use(bodyParser.json());
app.use('/uploads', express.static('uploads'));

// Image upload setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage });

// Authentication middleware
const authenticate = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).send('Access denied');
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(400).send('Invalid token');
    }
};

// Routes

// User registration
app.post('/api/register', async (req, res) => {
    const { username, email, password, role } = req.body;
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
            [username, email, hashedPassword, role || 'student']
        );
        
        const token = jwt.sign({ userId: result.rows[0].user_id, role: result.rows[0].role }, process.env.JWT_SECRET);
        res.json({ user: result.rows[0], token });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// User login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign({ userId: user.user_id, role: user.role }, process.env.JWT_SECRET);
        res.json({ user, token });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Course creation
app.post('/api/courses', authenticate, upload.single('image'), async (req, res) => {
    if (req.user.role !== 'instructor') {
        return res.status(403).json({ error: 'Only instructors can create courses' });
    }
    
    const { title, description, category_id, price, is_free } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;
    
    try {
        const result = await pool.query(
            'INSERT INTO courses (title, description, instructor_id, category_id, price, is_free, image_url) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [title, description, req.user.userId, category_id, price, is_free, image_url]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Get all courses with filtering
app.get('/api/courses', async (req, res) => {
    const { category, min_price, max_price, search, sort } = req.query;
    let query = 'SELECT c.*, u.username as instructor_name FROM courses c JOIN users u ON c.instructor_id = u.user_id WHERE 1=1';
    const params = [];
    
    if (category) {
        query += ' AND c.category_id = $1';
        params.push(category);
    }
    
    if (min_price) {
        query += ` AND c.price >= $${params.length + 1}`;
        params.push(min_price);
    }
    
    if (max_price) {
        query += ` AND c.price <= $${params.length + 1}`;
        params.push(max_price);
    }
    
    if (search) {
        query += ` AND (c.title ILIKE $${params.length + 1} OR c.description ILIKE $${params.length + 1})`;
        params.push(`%${search}%`);
    }
    
    if (sort === 'highest_rated') {
        query += ' ORDER BY c.average_rating DESC';
    } else if (sort === 'newest') {
        query += ' ORDER BY c.created_at DESC';
    } else if (sort === 'price_low') {
        query += ' ORDER BY c.price ASC';
    } else if (sort === 'price_high') {
        query += ' ORDER BY c.price DESC';
    } else {
        query += ' ORDER BY c.created_at DESC';
    }
    
    try {
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Get single course with sections and lectures
app.get('/api/courses/:id', async (req, res) => {
    try {
        const courseResult = await pool.query(
            'SELECT c.*, u.username as instructor_name FROM courses c JOIN users u ON c.instructor_id = u.user_id WHERE c.course_id = $1',
            [req.params.id]
        );
        
        if (courseResult.rows.length === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }
        
        const sectionsResult = await pool.query(
            'SELECT * FROM sections WHERE course_id = $1 ORDER BY order_index',
            [req.params.id]
        );
        
        const course = courseResult.rows[0];
        const sections = sectionsResult.rows;
        
        // Get lectures for each section
        for (const section of sections) {
            const lecturesResult = await pool.query(
                'SELECT * FROM lectures WHERE section_id = $1 ORDER BY order_index',
                [section.section_id]
            );
            section.lectures = lecturesResult.rows;
        }
        
        course.sections = sections;
        
        // Get reviews
        const reviewsResult = await pool.query(
            'SELECT r.*, u.username FROM reviews r JOIN users u ON r.student_id = u.user_id WHERE r.course_id = $1',
            [req.params.id]
        );
        
        course.reviews = reviewsResult.rows;
        
        res.json(course);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Enrollment
app.post('/api/enroll', authenticate, async (req, res) => {
    const { course_id } = req.body;
    
    try {
        // Check if course exists and get price
        const courseResult = await pool.query('SELECT * FROM courses WHERE course_id = $1', [course_id]);
        if (courseResult.rows.length === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }
        
        const course = courseResult.rows[0];
        
        // Check if already enrolled
        const existingEnrollment = await pool.query(
            'SELECT * FROM enrollments WHERE student_id = $1 AND course_id = $2',
            [req.user.userId, course_id]
        );
        
        if (existingEnrollment.rows.length > 0) {
            return res.status(400).json({ error: 'Already enrolled in this course' });
        }
        
        // Create enrollment
        const enrollmentResult = await pool.query(
            'INSERT INTO enrollments (student_id, course_id) VALUES ($1, $2) RETURNING *',
            [req.user.userId, course_id]
        );
        
        // If paid course, create payment record
        if (!course.is_free) {
            await pool.query(
                'INSERT INTO payments (enrollment_id, amount, status) VALUES ($1, $2, $3)',
                [enrollmentResult.rows[0].enrollment_id, course.price, 'pending']
            );
            
            // In a real app, you would integrate with a payment gateway here
            // For demo, we'll just mark as completed
            await pool.query(
                'UPDATE payments SET status = $1, payment_date = NOW() WHERE enrollment_id = $2',
                ['completed', enrollmentResult.rows[0].enrollment_id]
            );
        }
        
        // Update course student count
        await pool.query(
            'UPDATE courses SET total_students = total_students + 1 WHERE course_id = $1',
            [course_id]
        );
        
        res.json(enrollmentResult.rows[0]);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Add review
app.post('/api/reviews', authenticate, async (req, res) => {
    const { course_id, rating, comment } = req.body;
    
    try {
        // Check if enrolled
        const enrollment = await pool.query(
            'SELECT * FROM enrollments WHERE student_id = $1 AND course_id = $2',
            [req.user.userId, course_id]
        );
        
        if (enrollment.rows.length === 0) {
            return res.status(403).json({ error: 'You must enroll in the course before reviewing' });
        }
        
        // Check if already reviewed
        const existingReview = await pool.query(
            'SELECT * FROM reviews WHERE student_id = $1 AND course_id = $2',
            [req.user.userId, course_id]
        );
        
        if (existingReview.rows.length > 0) {
            return res.status(400).json({ error: 'You have already reviewed this course' });
        }
        
        // Add review
        const reviewResult = await pool.query(
            'INSERT INTO reviews (course_id, student_id, rating, comment) VALUES ($1, $2, $3, $4) RETURNING *',
            [course_id, req.user.userId, rating, comment]
        );
        
        // Update course average rating
        const avgResult = await pool.query(
            'SELECT AVG(rating) as avg_rating FROM reviews WHERE course_id = $1',
            [course_id]
        );
        
        await pool.query(
            'UPDATE courses SET average_rating = $1 WHERE course_id = $2',
            [parseFloat(avgResult.rows[0].avg_rating), course_id]
        );
        
        res.json(reviewResult.rows[0]);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Get all categories
app.get('/api/categories', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM categories ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import axios from 'axios';
import Header from './components/Header';
import Home from './pages/Home';
import CourseDetail from './pages/CourseDetail';
import CreateCourse from './pages/CreateCourse';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import CategoryCourses from './pages/CategoryCourses';

function App() {
  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    // Check for logged in user
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      // Fetch user data
      axios.get('/api/user')
        .then(res => setUser(res.data))
        .catch(() => {
          localStorage.removeItem('token');
          delete axios.defaults.headers.common['Authorization'];
        });
    }

    // Fetch categories
    axios.get('/api/categories')
      .then(res => setCategories(res.data))
      .catch(err => console.error(err));
  }, []);

  const login = (userData, token) => {
    localStorage.setItem('token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };

  return (
    <Router>
      <Header user={user} onLogout={logout} categories={categories} />
      <div className="container mt-4">
        <Switch>
          <Route exact path="/" render={() => <Home categories={categories} />} />
          <Route path="/login" render={() => <Login onLogin={login} />} />
          <Route path="/register" component={Register} />
          <Route path="/create-course" render={() => <CreateCourse user={user} categories={categories} />} />
          <Route path="/course/:id" component={CourseDetail} />
          <Route path="/category/:id" component={CategoryCourses} />
          <Route path="/dashboard" render={() => <Dashboard user={user} />} />
        </Switch>
      </div>
    </Router>
  );
}

export default App;


// components/CourseCard.js
import React from 'react';
import { Link } from 'react-router-dom';

const CourseCard = ({ course }) => {
  return (
    <div className="col-md-4 mb-4">
      <div className="card h-100">
        <img 
          src={course.image_url || '/default-course.jpg'} 
          className="card-img-top" 
          alt={course.title}
          style={{ height: '180px', objectFit: 'cover' }}
        />
        <div className="card-body">
          <h5 className="card-title">{course.title}</h5>
          <p className="card-text text-muted">{course.instructor_name}</p>
          <div className="mb-2">
            <span className="text-warning">
              {'★'.repeat(Math.round(course.average_rating))}
              {'☆'.repeat(5 - Math.round(course.average_rating))}
            </span>
            <span className="ml-2">({course.total_students} students)</span>
          </div>
          <h5 className="text-primary">
            {course.is_free ? 'FREE' : `$${course.price}`}
          </h5>
        </div>
        <div className="card-footer bg-white">
          <Link to={`/course/${course.course_id}`} className="btn btn-primary btn-block">
            View Course
          </Link>
        </div>
      </div>
    </div>
  );
};

export default CourseCard;

// pages/CreateCourse.js
import React, { useState } from 'react';
import axios from 'axios';

const CreateCourse = ({ user, categories }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category_id: '',
    price: 0,
    is_free: false,
    image: null
  });
  const [sections, setSections] = useState([{ title: '', lectures: [{ title: '', description: '', video: null }] }]);
  const [message, setMessage] = useState('');

  const handleChange = e => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleImageChange = e => {
    setFormData({
      ...formData,
      image: e.target.files[0]
    });
  };

  const handleSubmit = async e => {
    e.preventDefault();
    
    const data = new FormData();
    data.append('title', formData.title);
    data.append('description', formData.description);
    data.append('category_id', formData.category_id);
    data.append('price', formData.price);
    data.append('is_free', formData.is_free);
    if (formData.image) data.append('image', formData.image);
    
    try {
      const res = await axios.post('/api/courses', data);
      setMessage('Course created successfully!');
      
      // Now add sections and lectures
      for (const section of sections) {
        const sectionRes = await axios.post('/api/sections', {
          course_id: res.data.course_id,
          title: section.title,
          order_index: sections.indexOf(section) + 1
        });
        
        for (const lecture of section.lectures) {
          const lectureData = new FormData();
          lectureData.append('section_id', sectionRes.data.section_id);
          lectureData.append('title', lecture.title);
          lectureData.append('description', lecture.description);
          lectureData.append('order_index', section.lectures.indexOf(lecture) + 1);
          if (lecture.video) lectureData.append('video', lecture.video);
          
          await axios.post('/api/lectures', lectureData);
        }
      }
      
      setMessage('Course with all sections and lectures created successfully!');
    } catch (err) {
      setMessage(err.response?.data?.error || 'Error creating course');
    }
  };

  const addSection = () => {
    setSections([...sections, { title: '', lectures: [{ title: '', description: '', video: null }] }]);
  };

  const addLecture = (sectionIndex) => {
    const updatedSections = [...sections];
    updatedSections[sectionIndex].lectures.push({ title: '', description: '', video: null });
    setSections(updatedSections);
  };

  const handleSectionChange = (index, e) => {
    const updatedSections = [...sections];
    updatedSections[index].title = e.target.value;
    setSections(updatedSections);
  };

  const handleLectureChange = (sectionIndex, lectureIndex, e) => {
    const updatedSections = [...sections];
    updatedSections[sectionIndex].lectures[lectureIndex][e.target.name] = e.target.value;
    setSections(updatedSections);
  };

  const handleLectureVideoChange = (sectionIndex, lectureIndex, e) => {
    const updatedSections = [...sections];
    updatedSections[sectionIndex].lectures[lectureIndex].video = e.target.files[0];
    setSections(updatedSections);
  };

  if (!user || user.role !== 'instructor') {
    return <div className="alert alert-warning">Only instructors can create courses</div>;
  }

  return (
    <div className="container">
      <h2>Create New Course</h2>
      {message && <div className={`alert ${message.includes('successfully') ? 'alert-success' : 'alert-danger'}`}>{message}</div>}
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Course Title</label>
          <input
            type="text"
            className="form-control"
            name="title"
            value={formData.title}
            onChange={handleChange}
            required
          />
        </div>
        
        <div className="form-group">
          <label>Description</label>
          <textarea
            className="form-control"
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows="5"
            required
          />
        </div>
        
        <div className="form-group">
          <label>Category</label>
          <select
            className="form-control"
            name="category_id"
            value={formData.category_id}
            onChange={handleChange}
            required
          >
            <option value="">Select a category</option>
            {categories.map(category => (
              <option key={category.category_id} value={category.category_id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        
        <div className="form-group form-check">
          <input
            type="checkbox"
            className="form-check-input"
            name="is_free"
            checked={formData.is_free}
            onChange={handleChange}
          />
          <label className="form-check-label">Free Course</label>
        </div>
        
        {!formData.is_free && (
          <div className="form-group">
            <label>Price ($)</label>
            <input
              type="number"
              className="form-control"
              name="price"
              value={formData.price}
              onChange={handleChange}
              min="0"
              step="0.01"
              required
            />
          </div>
        )}
        
        <div className="form-group">
          <label>Course Image</label>
          <input
            type="file"
            className="form-control-file"
            onChange={handleImageChange}
            accept="image/*"
          />
        </div>
        
        <h4 className="mt-4">Course Curriculum</h4>
        {sections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="card mb-3">
            <div className="card-header">
              <input
                type="text"
                className="form-control"
                placeholder="Section title"
                value={section.title}
                onChange={(e) => handleSectionChange(sectionIndex, e)}
                required
              />
            </div>
            <div className="card-body">
              {section.lectures.map((lecture, lectureIndex) => (
                <div key={lectureIndex} className="mb-3 p-3 border rounded">
                  <div className="form-group">
                    <label>Lecture Title</label>
                    <input
                      type="text"
                      className="form-control"
                      name="title"
                      value={lecture.title}
                      onChange={(e) => handleLectureChange(sectionIndex, lectureIndex, e)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea
                      className="form-control"
                      name="description"
                      value={lecture.description}
                      onChange={(e) => handleLectureChange(sectionIndex, lectureIndex, e)}
                      rows="2"
                    />
                  </div>
                  <div className="form-group">
                    <label>Video File</label>
                    <input
                      type="file"
                      className="form-control-file"
                      onChange={(e) => handleLectureVideoChange(sectionIndex, lectureIndex, e)}
                      accept="video/*"
                      required
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => addLecture(sectionIndex)}
              >
                Add Lecture
              </button>
            </div>
          </div>
        ))}
        
        <button
          type="button"
          className="btn btn-outline-primary mb-3"
          onClick={addSection}
        >
          Add Section
        </button>
        
        <div className="form-group">
          <button type="submit" className="btn btn-primary">
            Create Course
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateCourse;

// components/SearchAndFilter.js
import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';

const SearchAndFilter = ({ categories }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [priceRange, setPriceRange] = useState('all');
  const history = useHistory();

  const handleSearch = (e) => {
    e.preventDefault();
    let query = '';
    
    if (searchTerm) query += `search=${encodeURIComponent(searchTerm)}`;
    if (categoryFilter) query += `${query ? '&' : ''}category=${categoryFilter}`;
    if (priceRange !== 'all') {
      if (priceRange === 'free') {
        query += `${query ? '&' : ''}min_price=0&max_price=0`;
      } else if (priceRange === 'paid') {
        query += `${query ? '&' : ''}min_price=0.01`;
      } else if (priceRange === 'under50') {
        query += `${query ? '&' : ''}max_price=50`;
      } else if (priceRange === '50to100') {
        query += `${query ? '&' : ''}min_price=50&max_price=100`;
      } else if (priceRange === 'over100') {
        query += `${query ? '&' : ''}min_price=100.01`;
      }
    }
    
    history.push(`/courses?${query}`);
  };

  return (
    <div className="card mb-4">
      <div className="card-body">
        <form onSubmit={handleSearch}>
          <div className="form-group">
            <input
              type="text"
              className="form-control"
              placeholder="Search courses..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="form-group">
            <label>Category</label>
            <select
              className="form-control"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map(category => (
                <option key={category.category_id} value={category.category_id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label>Price</label>
            <select
              className="form-control"
              value={priceRange}
              onChange={(e) => setPriceRange(e.target.value)}
            >
              <option value="all">All Prices</option>
              <option value="free">Free</option>
              <option value="paid">Paid</option>
              <option value="under50">Under $50</option>
              <option value="50to100">$50 - $100</option>
              <option value="over100">Over $100</option>
            </select>
          </div>
          
          <button type="submit" className="btn btn-primary btn-block">
            Apply Filters
          </button>
        </form>
      </div>
    </div>
  );
};

export default SearchAndFilter;

// components/PaymentForm.js
import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import axios from 'axios';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLIC_KEY);

const PaymentForm = ({ course, user }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePayment = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Create payment intent on backend
      const response = await axios.post('/api/create-payment-intent', {
        course_id: course.course_id,
        amount: course.price * 100 // convert to cents
      });
      
      const stripe = await stripePromise;
      const { error: stripeError } = await stripe.redirectToCheckout({
        sessionId: response.data.sessionId
      });
      
      if (stripeError) {
        setError(stripeError.message);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="card-body">
        <h5 className="card-title">Enroll in Course</h5>
        <p className="card-text">
          <strong>Price:</strong> ${course.price.toFixed(2)}
        </p>
        
        {error && <div className="alert alert-danger">{error}</div>}
        
        <button
          onClick={handlePayment}
          className="btn btn-primary btn-block"
          disabled={loading}
        >
          {loading ? 'Processing...' : 'Enroll Now'}
        </button>
        
        {course.is_free && (
          <button className="btn btn-success btn-block mt-2">
            Enroll for Free
          </button>
        )}
      </div>
    </div>
  );
};

export default PaymentForm;


// components/CourseReviews.js
import React, { useState } from 'react';
import axios from 'axios';

const CourseReviews = ({ reviews, courseId, user }) => {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [userReviews, setUserReviews] = useState(reviews);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    
    try {
      const response = await axios.post('/api/reviews', {
        course_id: courseId,
        rating,
        comment
      });
      
      setUserReviews([...userReviews, response.data]);
      setSuccess('Review submitted successfully!');
      setComment('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-5">
      <h4>Reviews</h4>
      
      {user && !userReviews.some(r => r.student_id === user.userId) && (
        <div className="card mb-4">
          <div className="card-body">
            <h5>Write a Review</h5>
            {error && <div className="alert alert-danger">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Rating</label>
                <select
                  className="form-control"
                  value={rating}
                  onChange={(e) => setRating(parseInt(e.target.value))}
                >
                  <option value="5">5 Stars</option>
                  <option value="4">4 Stars</option>
                  <option value="3">3 Stars</option>
                  <option value="2">2 Stars</option>
                  <option value="1">1 Star</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Comment</label>
                <textarea
                  className="form-control"
                  rows="3"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  required
                />
              </div>
              
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
              >
                {submitting ? 'Submitting...' : 'Submit Review'}
              </button>
            </form>
          </div>
        </div>
      )}
      
      {userReviews.length === 0 ? (
        <p>No reviews yet. Be the first to review!</p>
      ) : (
        userReviews.map(review => (
          <div key={review.review_id} className="card mb-3">
            <div className="card-body">
              <div className="d-flex justify-content-between">
                <h5>{review.username}</h5>
                <div className="text-warning">
                  {'★'.repeat(review.rating)}
                  {'☆'.repeat(5 - review.rating)}
                </div>
              </div>
              <p className="text-muted">
                {new Date(review.created_at).toLocaleDateString()}
              </p>
              <p>{review.comment}</p>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default CourseReviews;


INSERT INTO categories (name, description) VALUES
('Web Development', 'Learn to build modern websites and web applications'),
('Data Science', 'Master data analysis, machine learning, and visualization'),
('Mobile Development', 'Build apps for iOS and Android platforms'),
('Programming', 'Learn programming languages and computer science fundamentals'),
('Business', 'Business, finance, and entrepreneurship courses'),
('Design', 'Graphic design, UX/UI, and creative skills');

INSERT INTO courses (title, description, instructor_id, category_id, price, is_free, image_url) VALUES
('Complete Web Developer Bootcamp', 'Become a full-stack web developer with this comprehensive course', 1, 1, 199.99, false, '/images/web-dev.jpg'),
('Python for Data Science', 'Learn Python for data analysis and machine learning', 2, 2, 149.99, false, '/images/python-ds.jpg'),
('iOS App Development with Swift', 'Build iOS apps from scratch using Swift', 1, 3, 179.99, false, '/images/swift.jpg'),
('JavaScript Fundamentals', 'Master the basics of JavaScript programming', 2, 4, 0.00, true, '/images/js-fundamentals.jpg'),
('Digital Marketing Masterclass', 'Learn to market your business online', 1, 5, 129.99, false, '/images/digital-marketing.jpg'),
('UI/UX Design Principles', 'Essential design principles for creating great user experiences', 2, 6, 99.99, false, '/images/ui-ux.jpg'),
('Advanced React Development', 'Take your React skills to the next level', 1, 1, 159.99, false, '/images/react.jpg'),
('Introduction to Machine Learning', 'Beginner-friendly machine learning concepts', 2, 2, 0.00, true, '/images/ml-intro.jpg');

INSERT INTO sections (course_id, title, order_index) VALUES
(1, 'HTML & CSS Fundamentals', 1),
(1, 'JavaScript Basics', 2),
(1, 'Backend Development with Node.js', 3),
(1, 'Database Integration', 4),
(1, 'Final Project', 5),
(2, 'Python Basics', 1),
(2, 'Data Analysis with Pandas', 2),
(2, 'Data Visualization', 3),
(3, 'Swift Basics', 1),
(3, 'UIKit Fundamentals', 2),
(4, 'JavaScript Syntax', 1),
(4, 'DOM Manipulation', 2);

INSERT INTO lectures (section_id, title, description, video_url, duration, order_index) VALUES
(1, 'Introduction to HTML', 'Learn the basics of HTML structure', '/videos/html-intro.mp4', 1200, 1),
(1, 'CSS Styling', 'How to style your web pages with CSS', '/videos/css-styling.mp4', 1800, 2),
(2, 'JavaScript Variables', 'Understanding variables in JavaScript', '/videos/js-variables.mp4', 900, 1),
(2, 'Functions in JavaScript', 'How to write and use functions', '/videos/js-functions.mp4', 1500, 2),
(3, 'Introduction to Node.js', 'What is Node.js and how it works', '/videos/node-intro.mp4', 1200, 1),
(6, 'Python Data Types', 'Understanding Python data types', '/videos/python-types.mp4', 900, 1),
(6, 'Control Flow', 'If statements and loops in Python', '/videos/python-control.mp4', 1200, 2),
(9, 'Swift Syntax Basics', 'Basic syntax of Swift language', '/videos/swift-syntax.mp4', 1500, 1),
(11, 'JavaScript Variables', 'Variables and data types in JS', '/videos/js-vars.mp4', 900, 1),
(11, 'Functions and Scope', 'Functions and variable scope', '/videos/js-functions-scope.mp4', 1200, 2);

INSERT INTO enrollments (student_id, course_id, enrolled_at, completed) VALUES
(3, 1, '2023-01-15 10:30:00', false),
(3, 4, '2023-02-20 14:15:00', true),
(4, 2, '2023-03-05 09:00:00', false),
(4, 6, '2023-01-10 16:45:00', true),
(4, 8, '2023-04-01 11:20:00', false);

INSERT INTO payments (enrollment_id, amount, payment_method, transaction_id, status, payment_date) VALUES
(1, 199.99, 'credit_card', 'ch_1JABCDEFGHIJKLMNOPQRSTUV', 'completed', '2023-01-15 10:35:00'),
(3, 149.99, 'paypal', 'PAYID-MNOPQRS123456789ABCDEFGH', 'completed', '2023-03-05 09:05:00'),
(4, 99.99, 'credit_card', 'ch_1JABCDEFGHIJKLMNOPQRSTUV', 'completed', '2023-01-10 16:50:00');

INSERT INTO reviews (course_id, student_id, rating, comment) VALUES
(1, 3, 4, 'Great course with comprehensive content, but some sections could use more examples.'),
(4, 3, 5, 'Excellent free introduction to JavaScript! Perfect for beginners.'),
(6, 4, 4, 'Very informative design course with practical examples.'),
(8, 4, 5, 'Fantastic introduction to ML concepts. Made complex topics easy to understand.');

UPDATE courses SET 
average_rating = (SELECT AVG(rating) FROM reviews WHERE course_id = 1),
total_students = (SELECT COUNT(*) FROM enrollments WHERE course_id = 1)
WHERE course_id = 1;

UPDATE courses SET 
average_rating = (SELECT AVG(rating) FROM reviews WHERE course_id = 4),
total_students = (SELECT COUNT(*) FROM enrollments WHERE course_id = 4)
WHERE course_id = 4;

UPDATE courses SET 
average_rating = (SELECT AVG(rating) FROM reviews WHERE course_id = 6),
total_students = (SELECT COUNT(*) FROM enrollments WHERE course_id = 6)
WHERE course_id = 6;

UPDATE courses SET 
average_rating = (SELECT AVG(rating) FROM reviews WHERE course_id = 8),
total_students = (SELECT COUNT(*) FROM enrollments WHERE course_id = 8)
WHERE course_id = 8;


import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlassIcon, XMarkIcon, FunnelIcon } from '@heroicons/react/24/outline';

type Category = {
  id: number;
  name: string;
};

type PriceRange = {
  id: string;
  label: string;
  min?: number;
  max?: number;
};

const CourseSearchFilter = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedPrice, setSelectedPrice] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  
  // Sample price ranges - adjust as needed
  const priceRanges: PriceRange[] = [
    { id: 'all', label: 'All Prices' },
    { id: 'free', label: 'Free', min: 0, max: 0 },
    { id: 'paid', label: 'Paid', min: 0.01 },
    { id: 'under50', label: 'Under $50', max: 50 },
    { id: '50to100', label: '$50-$100', min: 50, max: 100 },
    { id: 'over100', label: 'Over $100', min: 100.01 },
  ];

  // Fetch categories from API
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch('/api/categories');
        const data = await response.json();
        setCategories(data);
      } catch (error) {
        console.error('Error fetching categories:', error);
      }
    };
    
    fetchCategories();
  }, []);

  // Handle search submission
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters();
  };

  // Apply all selected filters
  const applyFilters = () => {
    const queryParams = new URLSearchParams();
    
    if (searchQuery) queryParams.append('q', searchQuery);
    if (selectedCategory) queryParams.append('category', selectedCategory.toString());
    if (selectedPrice) {
      const range = priceRanges.find(r => r.id === selectedPrice);
      if (range) {
        if (range.min !== undefined) queryParams.append('min_price', range.min.toString());
        if (range.max !== undefined) queryParams.append('max_price', range.max.toString());
      }
    }
    
    navigate(`/courses?${queryParams.toString()}`);
    setShowFilters(false);
  };

  // Reset all filters
  const resetFilters = () => {
    setSearchQuery('');
    setSelectedCategory(null);
    setSelectedPrice(null);
    navigate('/courses');
    setShowFilters(false);
  };

  return (
    <div className="relative flex-1 max-w-3xl">
      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <MagnifyingGlassIcon className="w-5 h-5 text-gray-400" />
          </div>
          <input
            type="text"
            className="w-full p-2 pl-10 text-sm border border-gray-300 rounded-l-lg focus:ring-blue-500 focus:border-blue-500"
            placeholder="Search courses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-blue-600 rounded-r-lg hover:bg-blue-700 focus:outline-none"
        >
          Search
        </button>
        <button
          type="button"
          className="ml-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none"
          onClick={() => setShowFilters(!showFilters)}
        >
          <FunnelIcon className="w-5 h-5" />
        </button>
      </form>

      {/* Filter Dropdown */}
      {showFilters && (
        <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">Filters</h3>
              <button
                onClick={() => setShowFilters(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>
            
            {/* Category Filter */}
            <div className="mb-4">
              <label className="block mb-2 text-sm font-medium">Category</label>
              <select
                className="w-full p-2 text-sm border border-gray-300 rounded-md"
                value={selectedCategory || ''}
                onChange={(e) => setSelectedCategory(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">All Categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Price Filter */}
            <div className="mb-4">
              <label className="block mb-2 text-sm font-medium">Price</label>
              <div className="space-y-2">
                {priceRanges.map((range) => (
                  <div key={range.id} className="flex items-center">
                    <input
                      id={`price-${range.id}`}
                      name="price-range"
                      type="radio"
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                      checked={selectedPrice === range.id}
                      onChange={() => setSelectedPrice(range.id)}
                    />
                    <label
                      htmlFor={`price-${range.id}`}
                      className="ml-2 text-sm text-gray-700"
                    >
                      {range.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={resetFilters}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={applyFilters}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CourseSearchFilter;

import express from 'express';
import { Pool } from 'pg';

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Search and filter courses
router.get('/courses', async (req, res) => {
  try {
    const { q, category, min_price, max_price, sort } = req.query;
    
    let query = `
      SELECT 
        c.*, 
        u.username as instructor_name,
        cat.name as category_name
      FROM courses c
      JOIN users u ON c.instructor_id = u.user_id
      JOIN categories cat ON c.category_id = cat.category_id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramIndex = 1;

    // Search query filter
    if (q) {
      query += ` AND (c.title ILIKE $${paramIndex} OR c.description ILIKE $${paramIndex})`;
      params.push(`%${q}%`);
      paramIndex++;
    }

    // Category filter
    if (category) {
      query += ` AND c.category_id = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    // Price filters
    if (min_price) {
      query += ` AND c.price >= $${paramIndex}`;
      params.push(min_price);
      paramIndex++;
    }

    if (max_price) {
      query += ` AND c.price <= $${paramIndex}`;
      params.push(max_price);
      paramIndex++;
    }

    // Sorting
    switch (sort) {
      case 'highest_rated':
        query += ' ORDER BY c.average_rating DESC NULLS LAST';
        break;
      case 'newest':
        query += ' ORDER BY c.created_at DESC';
        break;
      case 'price_low':
        query += ' ORDER BY c.price ASC';
        break;
      case 'price_high':
        query += ' ORDER BY c.price DESC';
        break;
      default:
        query += ' ORDER BY c.created_at DESC';
    }

    // Pagination (optional)
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    // Get total count for pagination
    const countQuery = query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) FROM');
    const countResult = await pool.query(countQuery, params.slice(0, -2));
    const total = parseInt(countResult.rows[0].count);

    // Get filtered courses
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error searching courses:', error);
    res.status(500).json({ success: false, message: 'Error searching courses' });
  }
});

// Get all categories for filter dropdown
router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT category_id as id, name FROM categories ORDER BY name');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ success: false, message: 'Error fetching categories' });
  }
});

export default router;




Find your current username**:
   ```bash
   whoami
   # or
   echo $USER
   ```
# From your project root
ls -la client/assets/
# Or for the specific target directory
ls -ld documents/teams/experplus/client/assets

# Ensure the directory exists
mkdir -p client/assets

# Give your user ownership (replace "youruser" with actual username)
sudo chown -R youruser:youruser client/assets

# Set appropriate permissions (read/write/execute for owner, read/execute for others)
chmod -R 755 client/assets


# Test writing a file
node -e "require('fs').writeFileSync('client/assets/test.txt', 'test')"


chmod -R 755 client/assets




project-root/
├── client/
│   └── assets/          # Upload destination (relative path)
├── server/
│   ├── config/
│   ├── controllers/
│   ├── middlewares/
│   ├── routes/
│   └── app.js
└── package.json
```

## 2. File Upload Middleware

**server/middlewares/uploadMiddleware.js**

```javascript
const path = require('path');
const multer = require('multer');
const fs = require('fs');

// Relative to project root
const UPLOAD_DIR = path.join(__dirname, '../../client/assets');

// Ensure upload directory exists
const ensureUploadDir = () => {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { 
      recursive: true,
      mode: 0o755 // rwxr-xr-x permissions
    });
  }
};

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureUploadDir();
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and GIF images are allowed'), false);
  }
};

// Configure Multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

module.exports = upload;
```
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const unlinkAsync = promisify(fs.unlink);

// Relative path from project root
const UPLOAD_DIR = path.join(__dirname, '../../client/assets');

exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Construct relative path for database storage
    const relativePath = path.relative(
      path.join(__dirname, '../../'), 
      req.file.path
    );

    // For demonstration - in real app, save to database
    const fileData = {
      originalName: req.file.originalname,
      fileName: req.file.filename,
      path: relativePath,
      size: req.file.size,
      mimetype: req.file.mimetype,
      url: `/assets/${req.file.filename}`
    };

    res.status(201).json({
      success: true,
      data: fileData
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'File upload failed' });
  }
};

exports.deleteFile = async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(UPLOAD_DIR, filename);

    await unlinkAsync(filePath);
    
    res.json({ 
      success: true,
      message: 'File deleted successfully' 
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'File not found' });
    }
    res.status(500).json({ error: 'Error deleting file' });
  }
};


const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const upload = require('../middlewares/uploadMiddleware');
const { protect } = require('../middlewares/authMiddleware');

router.post(
  '/',
  protect,
  upload.single('file'), // 'file' is the field name in form-data
  uploadController.uploadFile
);

router.delete(
  '/:filename',
  protect,
  uploadController.deleteFile
);

module.exports = router;

const express = require('express');
const path = require('path');
const app = express();

// Middlewares
app.use(express.json());

// Static files - serve from relative path
const assetsDir = path.join(__dirname, '../client/assets');
app.use('/assets', express.static(assetsDir));

// Routes
app.use('/api/uploads', require('./routes/uploadRoutes'));

// Error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: err.message });
});

module.exports = app;

import React, { useState } from 'react';
import axios from 'axios';

const FileUpload = () => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('/api/uploads', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      console.log('Upload successful:', response.data);
      // Handle success (update state, show message, etc.)
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="file-upload">
      <form onSubmit={handleSubmit}>
        <input type="file" onChange={handleFileChange} accept="image/*" />
        {preview && (
          <div className="preview">
            <img src={preview} alt="Preview" style={{ maxWidth: '200px' }} />
          </div>
        )}
        <button type="submit" disabled={!file || uploading}>
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
};

export default FileUpload;











const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const { faker } = require('@faker-js/faker');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Generate random user data
function generateUserData() {
  const username = faker.internet.userName().toLowerCase() + Math.floor(Math.random() * 1000);
  const email = faker.internet.email().toLowerCase();
  const password = faker.internet.password({ length: 12, memorable: false, pattern: /[A-Za-z0-9!@#$%]/ });
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const phone = faker.phone.number('+234##########');
  
  return {
    username,
    email,
    password,
    firstName,
    lastName,
    phone,
    fullName: `${firstName} ${lastName}`,
    dateOfBirth: faker.date.birthdate({ min: 18, max: 65, mode: 'age' }),
    address: faker.location.streetAddress(),
    city: faker.location.city(),
    country: 'Nigeria'
  };
}

// Analyze site for signup form
async function analyzeSite(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Look for signup/register forms and buttons
    const signupIndicators = await page.evaluate(() => {
      const forms = document.querySelectorAll('form');
      const buttons = document.querySelectorAll('button, a, input[type="submit"]');
      
      const signupKeywords = ['sign up', 'signup', 'register', 'create account', 'join', 'get started'];
      
      let foundSignup = false;
      let signupUrl = null;
      
      // Check buttons and links
      buttons.forEach(btn => {
        const text = (btn.textContent || btn.value || '').toLowerCase();
        const href = btn.href || '';
        
        if (signupKeywords.some(keyword => text.includes(keyword) || href.includes(keyword))) {
          foundSignup = true;
          if (href) signupUrl = href;
        }
      });
      
      // Check forms
      const hasForm = forms.length > 0;
      const formInputs = [];
      
      forms.forEach(form => {
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
          formInputs.push({
            type: input.type || 'text',
            name: input.name || '',
            id: input.id || '',
            placeholder: input.placeholder || '',
            required: input.required
          });
        });
      });
      
      return {
        foundSignup,
        signupUrl,
        hasForm,
        formInputs,
        formsCount: forms.length
      };
    });
    
    await browser.close();
    
    return {
      canCreate: signupIndicators.foundSignup || signupIndicators.hasForm,
      details: signupIndicators,
      message: signupIndicators.foundSignup || signupIndicators.hasForm 
        ? 'Signup form detected! Ready to create accounts.' 
        : 'No signup form detected. This site may not support automated registration.'
    };
    
  } catch (error) {
    if (browser) await browser.close();
    return {
      canCreate: false,
      details: null,
      message: `Error analyzing site: ${error.message}`
    };
  }
}

// Create accounts on the target site
async function createAccounts(url, count) {
  const results = [];
  let browser;
  
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    for (let i = 0; i < count; i++) {
      const userData = generateUserData();
      const page = await browser.newPage();
      
      try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Smart form filling - detect and fill common fields
        await page.evaluate((data) => {
          const inputs = document.querySelectorAll('input, select, textarea');
          
          inputs.forEach(input => {
            const name = (input.name || '').toLowerCase();
            const id = (input.id || '').toLowerCase();
            const placeholder = (input.placeholder || '').toLowerCase();
            const type = input.type || 'text';
            
            const field = name + id + placeholder;
            
            // Username field
            if (field.includes('username') || field.includes('user')) {
              input.value = data.username;
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            // Email field
            else if (field.includes('email') || type === 'email') {
              input.value = data.email;
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            // Password field
            else if (field.includes('password') || type === 'password') {
              input.value = data.password;
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            // Confirm password
            else if (field.includes('confirm') && type === 'password') {
              input.value = data.password;
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            // First name
            else if (field.includes('firstname') || field.includes('first')) {
              input.value = data.firstName;
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            // Last name
            else if (field.includes('lastname') || field.includes('last')) {
              input.value = data.lastName;
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            // Phone
            else if (field.includes('phone') || field.includes('mobile') || type === 'tel') {
              input.value = data.phone;
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            // Full name
            else if (field.includes('fullname') || (field.includes('name') && !field.includes('username'))) {
              input.value = data.fullName;
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }
          });
        }, userData);
        
        // Wait a bit for any JavaScript validation
        await page.waitForTimeout(1000);
        
        // Try to find and click submit button
        const submitClicked = await page.evaluate(() => {
          const buttons = document.querySelectorAll('button[type="submit"], input[type="submit"], button');
          const submitKeywords = ['sign up', 'signup', 'register', 'create', 'submit', 'join', 'continue'];
          
          for (let btn of buttons) {
            const text = (btn.textContent || btn.value || '').toLowerCase();
            if (submitKeywords.some(keyword => text.includes(keyword))) {
              btn.click();
              return true;
            }
          }
          return false;
        });
        
        if (submitClicked) {
          await page.waitForTimeout(3000);
        }
        
        results.push({
          success: true,
          accountNumber: i + 1,
          credentials: {
            username: userData.username,
            email: userData.email,
            password: userData.password,
            firstName: userData.firstName,
            lastName: userData.lastName,
            phone: userData.phone
          }
        });
        
      } catch (error) {
        results.push({
          success: false,
          accountNumber: i + 1,
          error: error.message
        });
      }
      
      await page.close();
      
      // Random delay between accounts (1-3 seconds)
      if (i < count - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
      }
    }
    
    await browser.close();
    
  } catch (error) {
    if (browser) await browser.close();
    throw new Error(`Failed to create accounts: ${error.message}`);
  }
  
  return results;
}

// API Routes
app.get('/', (req, res) => {
  res.json({ 
    status: 'Multi-Account Creator API Running',
    version: '2.0.0',
    endpoints: {
      analyze: 'POST /api/analyze',
      create: 'POST /api/create'
    }
  });
});

// Analyze site endpoint
app.post('/api/analyze', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    const analysis = await analyzeSite(url);
    res.json(analysis);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create accounts endpoint
app.post('/api/create', async (req, res) => {
  try {
    const { url, count } = req.body;
    
    if (!url || !count) {
      return res.status(400).json({ error: 'URL and count are required' });
    }
    
    if (count < 2 || count > 7) {
      return res.status(400).json({ error: 'Count must be between 2 and 7' });
    }
    
    const results = await createAccounts(url, count);
    
    res.json({
      success: true,
      totalCreated: results.filter(r => r.success).length,
      totalFailed: results.filter(r => !r.success).length,
      accounts: results
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Multi-Account Creator API running on port ${PORT}`);
});

// ============================================================================
// AUTHENTICATION UI LOGIC
// ============================================================================

let isSignUpMode = false;

// DOM Elements
const signInForm = document.getElementById('signInForm');
const signUpForm = document.getElementById('signUpForm');
const toggleLink = document.getElementById('toggleLink');
const toggleText = document.getElementById('toggleText');
const authTitle = document.getElementById('authTitle');
const authSubtitle = document.getElementById('authSubtitle');
const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');

// Toggle between sign in and sign up
toggleLink.addEventListener('click', function(e) {
    e.preventDefault();
    isSignUpMode = !isSignUpMode;
    
    if (isSignUpMode) {
        signInForm.classList.add('hidden');
        signUpForm.classList.remove('hidden');
        authTitle.textContent = 'Create Account';
        authSubtitle.textContent = 'Join the sales dashboard';
        toggleText.textContent = 'Already have an account?';
        toggleLink.textContent = 'Sign In';
    } else {
        signInForm.classList.remove('hidden');
        signUpForm.classList.add('hidden');
        authTitle.textContent = 'Sign In';
        authSubtitle.textContent = 'Access your sales dashboard';
        toggleText.textContent = "Don't have an account?";
        toggleLink.textContent = 'Sign Up';
    }
    
    hideMessages();
});

// Show error message
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    successMessage.classList.add('hidden');
}

// Show success message
function showSuccess(message) {
    successMessage.textContent = message;
    successMessage.classList.remove('hidden');
    errorMessage.classList.add('hidden');
}

// Hide messages
function hideMessages() {
    errorMessage.classList.add('hidden');
    successMessage.classList.add('hidden');
}

// Wait for authManager to be ready before setting up handlers
function initializeAuthHandlers() {
    if (!window.authManager) {
        console.log('Waiting for authManager to initialize...');
        setTimeout(initializeAuthHandlers, 100);
        return;
    }
    
    console.log('authManager ready, setting up auth handlers...');
    
    // Handle sign in
    signInForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        hideMessages();
        
        const email = document.getElementById('signInEmail').value;
        const password = document.getElementById('signInPassword').value;
        const button = document.getElementById('signInButton');
        
        button.disabled = true;
        button.textContent = 'Signing In...';
        
        const result = await authManager.signIn(email, password);
        
        if (result.success) {
            showSuccess('Sign in successful! Redirecting...');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
        } else {
            showError(result.error);
            button.disabled = false;
            button.textContent = 'Sign In';
        }
    });

    // Handle sign up
    signUpForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        hideMessages();
        
        const name = document.getElementById('signUpName').value;
        const email = document.getElementById('signUpEmail').value;
        const password = document.getElementById('signUpPassword').value;
        const passwordConfirm = document.getElementById('signUpPasswordConfirm').value;
        const button = document.getElementById('signUpButton');
        
        // Validate passwords match
        if (password !== passwordConfirm) {
            showError('Passwords do not match');
            return;
        }
        
        // Validate password length
        if (password.length < 6) {
            showError('Password must be at least 6 characters');
            return;
        }
        
        button.disabled = true;
        button.textContent = 'Creating Account...';
        
        const result = await authManager.signUp(email, password, name);
        
        if (result.success) {
            showSuccess('Account created successfully! Redirecting...');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
        } else {
            showError(result.error);
            button.disabled = false;
            button.textContent = 'Create Account';
        }
    });

    // Check if user is already logged in
    authManager.onAuthStateChanged((user) => {
        if (user) {
            // User is signed in, redirect to dashboard
            window.location.href = 'index.html';
        }
    });
}

// Start initialization
initializeAuthHandlers();
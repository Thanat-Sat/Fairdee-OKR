// ============================================================================
// FIREBASE CONFIGURATION & AUTH MANAGER
// ============================================================================

const firebaseConfig = {
    apiKey: "AIzaSyBCUQKp8cMz9CM3hUA5YKvpZaOF84QflF4",
    authDomain: "fairdee-monthly-metr.firebaseapp.com",
    projectId: "fairdee-monthly-metr",
    storageBucket: "fairdee-monthly-metr.firebasestorage.app",
    messagingSenderId: "763249459864",
    appId: "1:763249459864:web:87aa13a352c050c93446ed"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// Only allow accounts on Fairdee's company domain
const ALLOWED_EMAIL_DOMAINS = ['fairdee.co.th'];
const DOMAIN_ERROR_MESSAGE = 'Access restricted to @' + ALLOWED_EMAIL_DOMAINS.join(' / @') + ' accounts.';

function isAllowedEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const domain = email.split('@')[1];
    if (!domain) return false;
    return ALLOWED_EMAIL_DOMAINS.includes(domain.toLowerCase());
}

// ============================================================================
// AUTH MANAGER
// ============================================================================

window.authManager = {
    // Sign in with email and password
    signIn: async function(email, password) {
        if (!isAllowedEmail(email)) {
            return { success: false, error: DOMAIN_ERROR_MESSAGE };
        }
        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            console.log('✅ Signed in:', userCredential.user.email);
            return { success: true, user: userCredential.user };
        } catch (error) {
            console.error('❌ Sign in error:', error.code, error.message);
            return { success: false, error: getErrorMessage(error.code) };
        }
    },

    // Sign up with email, password, and name
    signUp: async function(email, password, name) {
        if (!isAllowedEmail(email)) {
            return { success: false, error: DOMAIN_ERROR_MESSAGE };
        }
        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            // Update display name
            await user.updateProfile({ displayName: name });

            // Store user info in Firestore
            await db.collection('users').doc(user.uid).set({
                name: name,
                email: email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            console.log('✅ Account created:', user.email);
            return { success: true, user: user };
        } catch (error) {
            console.error('❌ Sign up error:', error.code, error.message);
            return { success: false, error: getErrorMessage(error.code) };
        }
    },

    // Sign in with Google (restricted to Fairdee Workspace accounts)
    signInWithGoogle: async function() {
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            // Hint Google to filter to the Fairdee Workspace domain
            provider.setCustomParameters({ hd: ALLOWED_EMAIL_DOMAINS[0] });

            const result = await auth.signInWithPopup(provider);
            const user = result.user;

            if (!isAllowedEmail(user.email)) {
                await auth.signOut();
                return { success: false, error: DOMAIN_ERROR_MESSAGE };
            }

            // Upsert user record on first Google sign-in
            await db.collection('users').doc(user.uid).set({
                name: user.displayName || '',
                email: user.email,
                provider: 'google',
                lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            console.log('✅ Google sign-in:', user.email);
            return { success: true, user: user };
        } catch (error) {
            console.error('❌ Google sign-in error:', error.code, error.message);
            if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
                return { success: false, error: 'Sign-in cancelled.' };
            }
            return { success: false, error: getErrorMessage(error.code) };
        }
    },

    // Sign out
    signOut: async function() {
        try {
            await auth.signOut();
            console.log('✅ Signed out');
            window.location.href = 'login.html';
            return { success: true };
        } catch (error) {
            console.error('❌ Sign out error:', error);
            return { success: false, error: error.message };
        }
    },

    // Get current user
    getCurrentUser: function() {
        return auth.currentUser;
    },

    // Listen to auth state changes
    onAuthStateChanged: function(callback) {
        auth.onAuthStateChanged(function(user) {
            if (user && !isAllowedEmail(user.email)) {
                console.warn('⚠️ Non-Fairdee account detected, signing out:', user.email);
                auth.signOut();
                callback(null);
                return;
            }
            callback(user);
        });
    }
};

// Friendly error messages
function getErrorMessage(errorCode) {
    switch (errorCode) {
        case 'auth/invalid-email':
            return 'Invalid email address.';
        case 'auth/user-disabled':
            return 'This account has been disabled.';
        case 'auth/user-not-found':
            return 'No account found with this email.';
        case 'auth/wrong-password':
            return 'Incorrect password.';
        case 'auth/invalid-credential':
            return 'Invalid email or password.';
        case 'auth/email-already-in-use':
            return 'An account with this email already exists.';
        case 'auth/weak-password':
            return 'Password must be at least 6 characters.';
        case 'auth/too-many-requests':
            return 'Too many attempts. Please try again later.';
        case 'auth/network-request-failed':
            return 'Network error. Please check your connection.';
        case 'auth/popup-blocked':
            return 'Popup was blocked by your browser. Please allow popups and try again.';
        case 'auth/account-exists-with-different-credential':
            return 'An account with this email already exists with a different sign-in method.';
        default:
            return 'An error occurred. Please try again.';
    }
}

console.log('✅ Firebase initialized — project:', firebaseConfig.projectId);

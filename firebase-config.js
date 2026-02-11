// ============================================================================
// FIREBASE CONFIGURATION & AUTH MANAGER
// ============================================================================

const firebaseConfig = {
    apiKey: "AIzaSyCHvF2m6Y1DUTyIIy6sokmsN39jU5pRlIQ",
    authDomain: "fairdee-okr.firebaseapp.com",
    projectId: "fairdee-okr",
    storageBucket: "fairdee-okr.firebasestorage.app",
    messagingSenderId: "682945622014",
    appId: "1:682945622014:web:287ff87afcb946dd781aaf"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// ============================================================================
// AUTH MANAGER
// ============================================================================

window.authManager = {
    // Sign in with email and password
    signIn: async function(email, password) {
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
        auth.onAuthStateChanged(callback);
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
        default:
            return 'An error occurred. Please try again.';
    }
}

console.log('✅ Firebase initialized — project:', firebaseConfig.projectId);
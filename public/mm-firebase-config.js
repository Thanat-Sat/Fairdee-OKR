// ============================================================================
// FIREBASE CONFIGURATION - FIRESTORE VERSION WITH ERROR CHECKING
// ============================================================================

console.log('Loading firebase-config.js...');

// Wait for Firebase SDK to be loaded
function initializeFirebase() {
    console.log('Checking Firebase availability...');
    
    // Check if Firebase is loaded
    if (typeof firebase === 'undefined') {
        console.error('❌ Firebase SDK not loaded!');
        alert('Firebase SDK failed to load. Please check your internet connection and refresh the page.');
        return;
    }
    
    console.log('✅ Firebase SDK loaded');
    console.log('Firebase version:', firebase.SDK_VERSION);
    
    // Check if Firestore is available
    if (typeof firebase.firestore === 'undefined') {
        console.error('❌ Firestore not available!');
        alert('Firestore SDK failed to load. Please refresh the page.');
        return;
    }
    
    console.log('✅ Firestore SDK available');

    // Your Firebase configuration
    const firebaseConfig = {
        apiKey: "AIzaSyBCUQKp8cMz9CM3hUA5YKvpZaOF84QflF4",
        authDomain: "fairdee-monthly-metr.firebaseapp.com",
        projectId: "fairdee-monthly-metr",
        storageBucket: "fairdee-monthly-metr.firebasestorage.app",
        messagingSenderId: "763249459864",
        appId: "1:763249459864:web:87aa13a352c050c93446ed"
    };

    // Initialize Firebase
    let app, auth, db;

    try {
        console.log('Initializing Firebase app...');
        app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
        console.log('✅ Firebase app initialized');
        
        console.log('Initializing Auth...');
        auth = firebase.auth();
        console.log('✅ Auth initialized');
        
        console.log('Initializing Firestore...');
        db = firebase.firestore();
        console.log('✅ Firestore initialized');
        console.log('Firestore instance:', db);
        
    } catch (error) {
        console.error('❌ Firebase initialization error:', error);
        alert('Firebase initialization failed: ' + error.message);
        return;
    }

    // ============================================================================
    // AUTHENTICATION STATE MANAGEMENT
    // ============================================================================

    class AuthManager {
        constructor() {
            this.currentUser = null;
            this.authStateCallbacks = [];
        }

        onAuthStateChanged(callback) {
            this.authStateCallbacks.push(callback);
            
            auth.onAuthStateChanged((user) => {
                this.currentUser = user;
                this.authStateCallbacks.forEach(cb => cb(user));
            });
        }

        async signIn(email, password) {
            try {
                const userCredential = await auth.signInWithEmailAndPassword(email, password);
                return { success: true, user: userCredential.user };
            } catch (error) {
                return { success: false, error: error.message };
            }
        }

        async signUp(email, password, displayName) {
            try {
                const userCredential = await auth.createUserWithEmailAndPassword(email, password);
                
                if (displayName) {
                    await userCredential.user.updateProfile({
                        displayName: displayName
                    });
                }
                
                return { success: true, user: userCredential.user };
            } catch (error) {
                return { success: false, error: error.message };
            }
        }

        async signOut() {
            try {
                await auth.signOut();
                return { success: true };
            } catch (error) {
                return { success: false, error: error.message };
            }
        }

        getCurrentUser() {
            return this.currentUser;
        }

        isAuthenticated() {
            return this.currentUser !== null;
        }
    }

    // ============================================================================
    // FIRESTORE DATABASE OPERATIONS FOR TARGETS
    // ============================================================================

    class TargetsDatabase {
        constructor() {
            console.log('Creating TargetsDatabase...');
            this.db = db;
            this.targetsCollection = db.collection('targets');
            console.log('✅ TargetsDatabase created, collection reference:', this.targetsCollection);
        }

        waitForCurrentUser() {
            if (auth.currentUser) {
                return Promise.resolve(auth.currentUser);
            }

            return new Promise((resolve, reject) => {
                let unsubscribe = null;
                const timeout = setTimeout(() => {
                    if (unsubscribe) unsubscribe();
                    reject(new Error('User not authenticated'));
                }, 8000);

                unsubscribe = auth.onAuthStateChanged((user) => {
                    clearTimeout(timeout);
                    if (unsubscribe) unsubscribe();
                    if (user) {
                        resolve(user);
                    } else {
                        reject(new Error('User not authenticated'));
                    }
                }, (error) => {
                    clearTimeout(timeout);
                    if (unsubscribe) unsubscribe();
                    reject(error);
                });
            });
        }

        async saveTarget(targetData) {
            try {
                console.log('saveTarget called with:', targetData);
                
                const user = await this.waitForCurrentUser();

                const dataToSave = {
                    type: targetData.type,
                    name: targetData.name,
                    month: targetData.month,
                    value: targetData.value,
                    unit: targetData.unit || 'THB',
                    notes: targetData.notes || '',
                    updatedBy: user.uid,
                    updatedByEmail: user.email,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                console.log('Data to save:', dataToSave);

                if (targetData.id) {
                    console.log('Updating existing target:', targetData.id);
                    await this.targetsCollection.doc(targetData.id).set(dataToSave, { merge: true });
                    console.log('✅ Target updated successfully');
                    return { success: true, id: targetData.id };
                } else {
                    console.log('Creating new target...');
                    const docRef = await this.targetsCollection.add(dataToSave);
                    console.log('✅ Target created with ID:', docRef.id);
                    return { success: true, id: docRef.id };
                }
            } catch (error) {
                console.error('❌ Error saving target:', error);
                return { success: false, error: error.message };
            }
        }

        async getAllTargets() {
            try {
                console.log('Getting all targets...');
                await this.waitForCurrentUser();
                const snapshot = await this.targetsCollection.orderBy('updatedAt', 'desc').get();
                const targets = [];
                
                snapshot.forEach((doc) => {
                    targets.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                
                console.log('✅ Loaded', targets.length, 'targets');
                return { success: true, targets };
            } catch (error) {
                console.error('❌ Error getting targets:', error);
                return { success: false, error: error.message };
            }
        }

        async getTargetById(targetId) {
            try {
                await this.waitForCurrentUser();
                const doc = await this.targetsCollection.doc(targetId).get();
                
                if (doc.exists) {
                    return { 
                        success: true, 
                        target: {
                            id: doc.id,
                            ...doc.data()
                        }
                    };
                } else {
                    return { success: false, error: 'Target not found' };
                }
            } catch (error) {
                console.error('Error getting target:', error);
                return { success: false, error: error.message };
            }
        }

        async getTargetsByType(type) {
            try {
                await this.waitForCurrentUser();
                const snapshot = await this.targetsCollection
                    .where('type', '==', type)
                    .orderBy('updatedAt', 'desc')
                    .get();
                
                const targets = [];
                snapshot.forEach((doc) => {
                    targets.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                
                return { success: true, targets };
            } catch (error) {
                console.error('Error getting targets by type:', error);
                return { success: false, error: error.message };
            }
        }

        async getTargetsByMonth(month) {
            try {
                await this.waitForCurrentUser();
                const snapshot = await this.targetsCollection
                    .where('month', '==', month)
                    .orderBy('updatedAt', 'desc')
                    .get();
                
                const targets = [];
                snapshot.forEach((doc) => {
                    targets.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                
                return { success: true, targets };
            } catch (error) {
                console.error('Error getting targets by month:', error);
                return { success: false, error: error.message };
            }
        }

        async updateTarget(targetId, updates) {
            try {
                const user = await this.waitForCurrentUser();

                const updateData = {
                    ...updates,
                    updatedBy: user.uid,
                    updatedByEmail: user.email,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                await this.targetsCollection.doc(targetId).update(updateData);
                return { success: true };
            } catch (error) {
                console.error('Error updating target:', error);
                return { success: false, error: error.message };
            }
        }

        async deleteTarget(targetId) {
            try {
                await this.waitForCurrentUser();
                await this.targetsCollection.doc(targetId).delete();
                console.log('Target deleted:', targetId);
                return { success: true };
            } catch (error) {
                console.error('Error deleting target:', error);
                return { success: false, error: error.message };
            }
        }

        onTargetsChanged(callback) {
            console.log('Setting up real-time listener...');
            let unsubscribe = null;
            let cancelled = false;

            this.waitForCurrentUser()
                .then(() => {
                    if (cancelled) return;
                    unsubscribe = this.targetsCollection.orderBy('updatedAt', 'desc').onSnapshot(
                        (snapshot) => {
                            const targets = [];
                            snapshot.forEach((doc) => {
                                targets.push({
                                    id: doc.id,
                                    ...doc.data()
                                });
                            });
                            console.log('Real-time update:', targets.length, 'targets');
                            callback(targets);
                        },
                        (error) => {
                            console.error('Error in real-time listener:', error);
                        }
                    );
                })
                .catch((error) => {
                    console.error('Error setting up real-time listener:', error);
                });

            return () => {
                cancelled = true;
                if (unsubscribe) unsubscribe();
            };
        }

        offTargetsChanged(unsubscribe) {
            if (unsubscribe && typeof unsubscribe === 'function') {
                unsubscribe();
                console.log('Real-time listener unsubscribed');
            }
        }
    }

    // Create global instances
    console.log('Creating global instances...');
    window.authManager = new AuthManager();
    window.targetsDB = new TargetsDatabase();
    console.log('✅ authManager created');
    console.log('✅ targetsDB created');

    console.log('='.repeat(60));
    console.log('✅ Firebase initialization complete!');
    console.log('Project:', firebaseConfig.projectId);
    console.log('Using Firestore Database');
    console.log('='.repeat(60));
}

// Wait for DOM and Firebase SDK to load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        console.log('DOM loaded, waiting for Firebase...');
        setTimeout(initializeFirebase, 100);
    });
} else {
    console.log('DOM already loaded, waiting for Firebase...');
    setTimeout(initializeFirebase, 100);
}

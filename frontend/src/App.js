import React, { useState, useEffect, useRef } from "react";
import "./App.css";

const App = () => {
  const [reminderText, setReminderText] = useState("Time to take a break!");
  const [intervalValue, setIntervalValue] = useState(5);
  const [intervalUnit, setIntervalUnit] = useState("minutes"); // "seconds" or "minutes"
  const [isActive, setIsActive] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState("default");
  const [nextReminderTime, setNextReminderTime] = useState(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [permissionDeniedCount, setPermissionDeniedCount] = useState(0);
  const [showPermissionHelp, setShowPermissionHelp] = useState(false);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const deferredPrompt = useRef(null);
  const reminderIdRef = useRef(Date.now());
  const keepAliveIntervalRef = useRef(null);

  // Calculate interval in milliseconds
  const getIntervalMs = () => {
    return intervalUnit === "seconds" ? intervalValue * 1000 : intervalValue * 60 * 1000;
  };

  // Enhanced notification permission check with better user interaction handling
  useEffect(() => {
    if ("Notification" in window) {
      setNotificationPermission(Notification.permission);
      
      // Check if user has denied permission multiple times
      const deniedCount = parseInt(localStorage.getItem('notificationDeniedCount') || '0');
      setPermissionDeniedCount(deniedCount);
      
      if (deniedCount >= 2 && Notification.permission === 'denied') {
        setShowPermissionHelp(true);
      }
    }

    // Handle PWA install prompt
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      deferredPrompt.current = e;
      setShowInstallPrompt(true);
      console.log('PWA install prompt available');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches || 
        window.navigator.standalone === true) {
      setShowInstallPrompt(false);
      console.log('PWA is installed and running in standalone mode');
    }

    // Enhanced service worker registration with better background persistence
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((registration) => {
          console.log('Service Worker registered successfully:', registration);
          
          // Handle service worker updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('New service worker installed');
                  // Don't auto-refresh, let user decide
                }
              });
            }
          });
          
          // Keep service worker alive with periodic messages
          if (registration.active) {
            startKeepAlive();
          }
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    }

    // Handle page visibility changes for better background behavior
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('App went to background - service worker should maintain reminders');
      } else {
        console.log('App came to foreground');
        // Sync state with service worker
        if (isActive) {
          setNextReminderTime(calculateNextReminderTime());
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopKeepAlive();
    };
  }, []);

  // Keep service worker alive
  const startKeepAlive = () => {
    keepAliveIntervalRef.current = setInterval(() => {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = (event) => {
          if (event.data.type === 'KEEP_ALIVE_ACK') {
            console.log('Service worker is alive');
          }
        };
        
        navigator.serviceWorker.controller.postMessage(
          { type: 'KEEP_ALIVE' },
          [messageChannel.port2]
        );
      }
    }, 25000); // Every 25 seconds
  };

  const stopKeepAlive = () => {
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }
  };

  // Enhanced PWA installation with better Android support
  const handleInstallClick = async () => {
    if (!deferredPrompt.current) {
      // For Android Chrome, provide manual installation instructions
      const isAndroid = /Android/i.test(navigator.userAgent);
      const isChrome = /Chrome/i.test(navigator.userAgent);
      const isSafari = /Safari/i.test(navigator.userAgent) && !/Chrome/i.test(navigator.userAgent);
      
      if (isAndroid && isChrome) {
        alert(
          "To install this app:\n\n" +
          "1. Tap the three dots (⋮) in Chrome\n" +
          "2. Select 'Add to Home screen'\n" +
          "3. Choose 'Install' (not just 'Add')\n" +
          "4. Tap 'Install' when prompted\n\n" +
          "The app will then appear in your app drawer like other apps!"
        );
      } else if (isSafari) {
        alert(
          "To install this app on Safari:\n\n" +
          "1. Tap the Share button (📤)\n" +
          "2. Select 'Add to Home Screen'\n" +
          "3. Tap 'Add' when prompted\n\n" +
          "The app will appear on your home screen!"
        );
      } else {
        alert("This app can be installed on supported browsers. Try using Chrome on Android or Safari on iOS.");
      }
      return;
    }

    try {
      // Show the install prompt
      deferredPrompt.current.prompt();

      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.current.userChoice;

      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
        setShowInstallPrompt(false);
      } else {
        console.log('User dismissed the install prompt');
      }

      // Clear the saved prompt since it can't be used again
      deferredPrompt.current = null;
    } catch (error) {
      console.error('Error during installation:', error);
      
      // Fallback for manual installation
      const isAndroid = /Android/i.test(navigator.userAgent);
      const isChrome = /Chrome/i.test(navigator.userAgent);
      
      if (isAndroid && isChrome) {
        alert(
          "To install this app manually:\n\n" +
          "1. Open Chrome menu (three dots)\n" +
          "2. Select 'Add to Home screen'\n" +
          "3. Choose 'Install' (not just 'Add')\n" +
          "4. Tap 'Install' when prompted\n\n" +
          "The app will appear in your app drawer!"
        );
      } else {
        alert(
          "To install this app manually:\n\n" +
          "1. Open browser menu\n" +
          "2. Select 'Add to Home screen' or 'Install'\n" +
          "3. Tap 'Install' when prompted\n\n" +
          "The app will appear on your device!"
        );
      }
    }
  };

  // Enhanced notification permission request with proper user interaction handling
  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      alert("This browser doesn't support notifications");
      return false;
    }

    // Check current permission status
    const currentPermission = Notification.permission;
    console.log('Current notification permission:', currentPermission);

    if (currentPermission === "granted") {
      setNotificationPermission("granted");
      return true;
    }

    if (currentPermission === "denied") {
      // Handle denied permissions with better user guidance
      const deniedCount = permissionDeniedCount + 1;
      setPermissionDeniedCount(deniedCount);
      localStorage.setItem('notificationDeniedCount', deniedCount.toString());
      
      if (deniedCount >= 2) {
        setShowPermissionHelp(true);
        alert(
          "Notification permissions have been denied. To enable notifications:\n\n" +
          "1. Click the lock icon (🔒) in your browser's address bar\n" +
          "2. Find 'Notifications' and set it to 'Allow'\n" +
          "3. Refresh the page and try again\n\n" +
          "Or check your browser settings for this site."
        );
      } else {
        alert(
          "Notifications are currently blocked. Please allow notifications for reminders to work properly.\n\n" +
          "Click the lock icon in your browser's address bar to change this setting."
        );
      }
      return false;
    }

    try {
      // Request permission - this MUST be called from a user interaction
      const permission = await Notification.requestPermission();
      console.log('Notification permission request result:', permission);
      
      setNotificationPermission(permission);
      
      if (permission === "granted") {
        console.log("Notification permission granted!");
        // Reset denied count on successful grant
        setPermissionDeniedCount(0);
        localStorage.removeItem('notificationDeniedCount');
        setShowPermissionHelp(false);
        return true;
      } else if (permission === "denied") {
        const deniedCount = permissionDeniedCount + 1;
        setPermissionDeniedCount(deniedCount);
        localStorage.setItem('notificationDeniedCount', deniedCount.toString());
        
        alert(
          "Notification permission was denied. To enable notifications:\n\n" +
          "1. Click the lock icon (🔒) in your browser's address bar\n" +
          "2. Set 'Notifications' to 'Allow'\n" +
          "3. Refresh the page and try again"
        );
        return false;
      } else {
        console.log("Notification permission dismissed");
        return false;
      }
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      alert("Failed to request notification permission. Please try again.");
      return false;
    }
  };

  // Enhanced notification system with background support
  const showNotification = () => {
    try {
      if (!("Notification" in window)) {
        console.log("This browser does not support notifications");
        return;
      }

      if (Notification.permission !== "granted") {
        console.log("Notification permission not granted:", Notification.permission);
        return;
      }

      // Use service worker for persistent background notifications
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        // Send message to service worker for persistent notification
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          title: 'Smart Reminder',
          body: reminderText,
          tag: 'reminder-' + Date.now()
        });
        console.log('Persistent notification requested via service worker');
      } else {
        console.log('Service worker not ready, using fallback notification');
        
        // Fallback to regular web notification
        const notification = new Notification("Smart Reminder", {
          body: reminderText,
          icon: "/icon-192x192.png",
          badge: "/icon-192x192.png",
          tag: "reminder-notification",
          requireInteraction: false,
          silent: false,
          timestamp: Date.now(),
          renotify: true
        });

        // Auto-dismiss after 10 seconds
        setTimeout(() => {
          try {
            notification.close();
          } catch (e) {
            console.log("Error closing notification:", e);
          }
        }, 10000);

        // Handle notification click
        notification.onclick = function(event) {
          try {
            event.preventDefault();
            window.focus();
            this.close();
          } catch (e) {
            console.log("Error handling notification click:", e);
          }
        };
      }

    } catch (error) {
      console.error("Error creating notification:", error);
    }
  };

  // Calculate next reminder time
  const calculateNextReminderTime = () => {
    const now = new Date();
    const next = new Date(now.getTime() + getIntervalMs());
    return next;
  };

  // Update next reminder time every second when active
  useEffect(() => {
    if (isActive) {
      const timer = setInterval(() => {
        setNextReminderTime(calculateNextReminderTime());
      }, 1000);
      return () => clearInterval(timer);
    } else {
      setNextReminderTime(null);
    }
  }, [isActive, intervalValue, intervalUnit]);

  // Start reminders
  const startReminders = async () => {
    if (!reminderText.trim()) {
      alert("Please enter a reminder message!");
      return;
    }

    if (intervalValue < 1) {
      const unit = intervalUnit === "seconds" ? "second" : "minute";
      alert(`Please enter a valid interval (minimum 1 ${unit})!`);
      return;
    }

    // Request permission if not granted
    if (notificationPermission !== "granted") {
      const granted = await requestNotificationPermission();
      if (!granted) {
        alert("Notifications are required for reminders to work. Please enable them in your browser settings.");
        return;
      }
    }

    setIsActive(true);
    setNextReminderTime(calculateNextReminderTime());
    
    // Show first notification immediately
    showNotification();
    
    // Set up recurring notifications
    intervalRef.current = setInterval(() => {
      showNotification();
    }, getIntervalMs());
  };

  // Stop reminders
  const stopReminders = () => {
    setIsActive(false);
    setNextReminderTime(null);
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  // Format time for display
  const formatTime = (date) => {
    if (!date) return "";
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopReminders();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500 rounded-full mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5-5-5h5v-8h5l-5-5-5 5h5v8z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Smart Reminders</h1>
          <p className="text-gray-600 max-w-md mx-auto">
            Set custom reminders that notify you at regular intervals. Perfect for habits, breaks, or any recurring tasks.
          </p>
          
          {/* PWA Install Prompt */}
          {showInstallPrompt && (
            <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-center mb-3">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-3">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-blue-800 font-medium text-sm">Install App</h3>
                  <p className="text-blue-600 text-xs">Get quick access from your home screen</p>
                </div>
              </div>
              <button
                onClick={handleInstallClick}
                className="w-full inline-flex items-center justify-center px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors duration-200"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Install Smart Reminders
              </button>
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="max-w-md mx-auto">
          {/* Notification Permission Alert */}
          {notificationPermission === "denied" && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-red-800 text-sm font-medium">Notifications Blocked</p>
                  <p className="text-red-700 text-xs">Please enable notifications in your browser settings for reminders to work.</p>
                </div>
              </div>
            </div>
          )}

          {/* Status Card */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-100">
            <div className="text-center">
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium mb-3 ${
                isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
              }`}>
                <div className={`w-2 h-2 rounded-full mr-2 ${
                  isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                }`}></div>
                {isActive ? 'Active' : 'Inactive'}
              </div>
              
              {isActive && nextReminderTime && (
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-1">Next reminder at:</p>
                  <p className="text-lg font-mono font-bold text-blue-600">
                    {formatTime(nextReminderTime)}
                  </p>
                </div>
              )}
              
              {!isActive && (
                <p className="text-gray-500 text-sm">Click Start to begin receiving reminders</p>
              )}
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <form onSubmit={(e) => { e.preventDefault(); isActive ? stopReminders() : startReminders(); }}>
              {/* Reminder Text Input */}
              <div className="mb-6">
                <label htmlFor="reminderText" className="block text-sm font-medium text-gray-700 mb-2">
                  Reminder Message
                </label>
                <textarea
                  id="reminderText"
                  value={reminderText}
                  onChange={(e) => setReminderText(e.target.value)}
                  placeholder="Enter your reminder message..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 resize-none bg-white text-gray-900 placeholder-gray-500"
                  rows="3"
                  disabled={isActive}
                />
              </div>

              {/* Interval Dropdown */}
              <div className="mb-6">
                <label htmlFor="interval" className="block text-sm font-medium text-gray-700 mb-2">
                  Reminder Interval
                </label>
                <div className="relative">
                  <select
                    id="interval"
                    value={`${intervalValue}-${intervalUnit}`}
                    onChange={(e) => {
                      const [value, unit] = e.target.value.split('-');
                      setIntervalValue(parseInt(value));
                      setIntervalUnit(unit);
                    }}
                    className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white text-gray-900 appearance-none cursor-pointer"
                    disabled={isActive}
                  >
                    <option value="20-seconds" className="text-gray-900 bg-white">20 seconds</option>
                    <option value="30-seconds" className="text-gray-900 bg-white">30 seconds</option>
                    {[...Array(30)].map((_, index) => {
                      const minutes = index + 1;
                      return (
                        <option key={`${minutes}-minutes`} value={`${minutes}-minutes`} className="text-gray-900 bg-white">
                          {minutes} minute{minutes > 1 ? 's' : ''}
                        </option>
                      );
                    })}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                    </svg>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Choose from 20 seconds to 30 minutes
                </p>
              </div>

              {/* Action Button */}
              <button
                type="submit"
                className={`w-full py-3 px-6 rounded-lg font-medium text-white transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-4 ${
                  isActive 
                    ? 'bg-red-500 hover:bg-red-600 focus:ring-red-200' 
                    : 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-200'
                }`}
              >
                {isActive ? (
                  <span className="flex items-center justify-center">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9l6 6m0-6l-6 6" />
                    </svg>
                    Stop Reminders
                  </span>
                ) : (
                  <span className="flex items-center justify-center">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.5a2.5 2.5 0 110 5H9m4.5-1.206a11.955 11.955 0 01-4.5 2.606m0 0V21m0-6.5a11.955 11.955 0 01-4.5-2.606m4.5 2.606L12 21l-1.5-4.5M3 3l18 18" />
                    </svg>
                    Start Reminders
                  </span>
                )}
              </button>
            </form>
          </div>

          {/* Info Card */}
          <div className="bg-blue-50 rounded-xl p-6 mt-6 border border-blue-100">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-blue-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div>
                <h3 className="text-blue-800 font-medium text-sm mb-1">How it works</h3>
                <ul className="text-blue-700 text-xs space-y-1">
                  <li>• Notifications appear automatically at your set interval</li>
                  <li>• Each notification disappears after 10 seconds</li>
                  <li>• Works in the background even when tab is not active</li>
                  <li>• Click notifications to bring this page to focus</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
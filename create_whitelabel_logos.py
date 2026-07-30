import os

target_dir = "/Users/apple/Projects/AI/bizcrm/bizcrm_frontend_dist/assets"

def create_svg_logo(brand_name, tagline, primary_color, secondary_color, is_partner=False):
    star_color = "#F59E0B" # Gold
    circle_red = "#E31D24"
    circle_other = "#0D6838" if is_partner else "#1D70B8"
    
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 110" width="420" height="110">
  <g transform="translate(10, 5)">
    <!-- Star & Swoosh Icon -->
    <circle cx="50" cy="50" r="40" fill="none" stroke="{circle_red}" stroke-width="6"/>
    <path d="M 25,65 Q 45,85 70,60 T 80,30" fill="none" stroke="{circle_other}" stroke-width="6" stroke-linecap="round"/>
    <polygon points="50,10 60,35 85,35 65,50 72,75 50,60 28,75 35,50 15,35 40,35" fill="{star_color}"/>
  </g>
  <!-- Text -->
  <text x="115" y="52" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-weight="900" font-size="26" fill="{primary_color}">{brand_name.upper()}</text>
  <text x="115" y="80" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-weight="600" font-size="13" stroke-width="0.5" fill="{secondary_color}">{tagline.upper()}</text>
</svg>'''
    return svg

# Save SVGs
topartners_svg = create_svg_logo("To Partners", "Kết nối cùng phát triển", "#1D70B8", "#E31D24", is_partner=False)
traduoc_svg = create_svg_logo("Trà Dược Việt Nam", "Phước lành cho sức khỏe", "#0D6838", "#E31D24", is_partner=True)

with open(os.path.join(target_dir, "logo-topartners.svg"), "w", encoding="utf-8") as f:
    f.write(topartners_svg)

with open(os.path.join(target_dir, "logo-traduocvietnam.svg"), "w", encoding="utf-8") as f:
    f.write(traduoc_svg)

print("Created SVG Whitelabel Logos!")

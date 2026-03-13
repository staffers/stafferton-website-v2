# Stafferton — Static Site for Cloudflare Pages

A clean, dark-themed agency site inspired by the Landio Framer template. Built as a fully static site with a simple localStorage-based CMS for blog posts and case studies.

## 📁 File Structure

```
landio/
├── index.html          # Homepage (all sections)
├── blog.html           # Blog listing
├── post.html           # Individual blog post (URL param: ?slug=...)
├── contact.html        # Contact page
├── admin.html          # CMS Admin panel
├── _redirects          # Cloudflare Pages redirects
├── css/
│   └── style.css       # All styles
└── js/
    ├── cms.js          # Content data + CMS logic
    └── main.js         # Interactions, animations, FAQ, pricing toggle
```

## 🚀 Deploy to Cloudflare Pages

1. Push this folder to a GitHub/GitLab repository
2. Go to [Cloudflare Pages](https://pages.cloudflare.com/)
3. Click "Create a project" → Connect to Git
4. Select your repository
5. Build settings:
   - **Framework preset**: None
   - **Build command**: (leave empty)
   - **Build output directory**: `/` or `.`
6. Click "Save and Deploy"

That's it — no build step needed. Pure static HTML.

## ✏️ Managing Content

### Option 1: Admin Panel (browser UI)
Visit `/admin.html` on your live site. Default password: `admin123`

⚠️ **Important**: The admin panel uses `localStorage` — content is saved to the **browser** you're using, not a server. This means:
- Content is device-specific (works great for solo use on one machine)
- Won't sync across devices unless you export and update `cms.js`

### Option 2: Edit cms.js directly
Open `js/cms.js` and edit the `CMS.posts` and `CMS.caseStudies` arrays. Redeploy to Cloudflare Pages.

This is the recommended approach for permanent content — edit the data, commit, push.

## 🔒 Changing the Admin Password

Open `admin.html` and find:
```javascript
const ADMIN_PASSWORD = 'admin123';
```
Change it to something secure.

## 🎨 Customisation

- **Colours**: Edit CSS variables at the top of `css/style.css`
- **Content**: Edit `js/cms.js` for blog posts and case studies
- **Nav/Footer links**: Update in each HTML file
- **Pricing**: Update prices in `index.html`
- **Contact email**: Search for `hello@landio.agency` and replace

## 📝 Adding Blog Posts (cms.js format)

```javascript
{
  id: 4,                          // Unique number
  slug: "my-new-post",           // URL: /post.html?slug=my-new-post
  category: "SEO",
  title: "My New Post Title",
  excerpt: "Short description for the blog listing page.",
  date: "1 Mar 2025",
  readTime: "4 min read",
  icon: "🔍",                    // Emoji shown on card
  content: `<p>Full post content in HTML...</p>
  <h2>A subheading</h2>
  <p>More content...</p>`
}
```

## 📊 Adding Case Studies (cms.js format)

```javascript
{
  id: 4,
  name: "Client Name / Headline",
  company: "Company Name",
  role: "CEO",
  description: "Brief description of the project and results.",
  stat1_num: "40%",
  stat1_label: "Increase in traffic",
  stat2_num: "25%",
  stat2_label: "Growth in revenue",
  icon: "🚀"
}
```

## 🔮 Upgrading to a Real CMS

When you're ready for multi-device editing, consider:
- **Cloudflare D1** (SQLite at the edge) + a tiny Worker API
- **Contentful** or **Sanity** headless CMS (free tiers available)
- **Netlify CMS** / **Decap CMS** (Git-based, free)

The current JSON structure in `cms.js` maps cleanly to any of these.

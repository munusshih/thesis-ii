# Welcome to Your Class Website Template! 👋

Hey there, fellow educator! I'm excited to share this template with you. I've built this specifically for teachers like us who want a simple, elegant way to organize and share course content with students.

If you're comfortable with HTML, CSS, and JavaScript but haven't used [Astro](https://astro.build/) before, don't worry – I've designed this to be super approachable. You'll be up and running in minutes!

## 🎯 What I've Built for You

I wanted to solve the common pain points we face when managing course websites:

- **Weekly Organization**: I've structured everything around weeks – just like how we plan our courses
- **Simple Publishing**: Want to hide next week's content? Just add an underscore to the filename. It's that easy!
- **Modern & Fast**: Built with Astro, but you don't need to learn it – just focus on your content
- **Familiar Writing**: Use Markdown, which feels just like writing in any text editor
- **Works Everywhere**: Your students can access it perfectly on phones, tablets, and computers
- **Professional Features**: I've included RSS feeds and search engine optimization out of the box

## 🚀 Let's Get You Started!

### What You'll Need

Don't worry – the setup is straightforward:

- [Node.js](https://nodejs.org/) (version 18 or higher) – think of this as the engine that runs everything
- Your favorite text editor (I highly recommend [VS Code](https://code.visualstudio.com/) – it's free and fantastic)
- That's it! If you're reading this, you already have everything else you need

### Getting Your Site Running

I promise this is easier than it looks:

1. **Get the template**: Download or clone this to your computer
2. **Install the magic**: Open your terminal and run:
   ```bash
   npm install
   ```
3. **See it come alive**:
   ```bash
   npm run dev
   ```
4. **Check it out**: Open `http://localhost:4321` in your browser and watch the magic happen!

You should see your new class website running. Pretty cool, right?

## 📁 How I've Organized Everything

I've structured this template to match how we naturally think about courses. Here's what you'll find:

```
your-class-site/
├── src/
│   ├── components/          # The building blocks (I've handled this for you)
│   │   ├── BaseHead.astro   # All the technical HTML head stuff
│   │   ├── Footer.astro     # Your site footer
│   │   └── Nav.astro        # Auto-magical navigation menu
│   ├── content/
│   │   └── weeks/           # 🌟 THIS IS WHERE YOU'LL SPEND YOUR TIME
│   │       ├── week-1.md    # ✅ Live and visible to students
│   │       └── _template.md # ❌ Hidden (starts with underscore)
│   ├── layouts/
│   │   └── WeekPost.astro   # How each week page looks (customizable!)
│   ├── pages/
│   │   ├── index.astro      # Your homepage with all the navigation
│   │   ├── [...slug].astro  # The magic that makes individual weeks work
│   │   └── rss.xml.js       # RSS feed for tech-savvy students
│   ├── styles/
│   │   └── global.css       # Make it look exactly how you want
│   └── consts.ts            # Your site's basic info (name, description)
├── public/                  # Drop images and files here
└── package.json             # The technical stuff (you can ignore this)
```

The beauty is in the `weeks/` folder – that's your workspace. Everything else? I've got you covered.

## ✏️ Creating Your Course Content (This is the Fun Part!)

Let me walk you through how to make this template truly yours.

### First Things First: Make It Your Own

Pop open `src/consts.ts` and tell the world about your amazing course:

```typescript
export const SITE_TITLE = "Your Awesome Class Name";
export const SITE_DESCRIPTION = "What makes your course special";
```

### Writing Your Weekly Content

Here's where the magic happens! Head to `src/content/weeks/` – this is your new best friend.

I like to think of each week as a digital handout. Here's how I recommend structuring a week:

#### Example Week (`week-1.md`):

```markdown
---
title: "Welcome to Web Development!"
description: "Let's dive into the exciting world of building for the web. We'll start with the fundamentals and work our way up."
week: 1
---

## What We're Covering This Week

- How the internet actually works (it's cooler than you think!)
- Your first HTML page
- Making it pretty with CSS

## Before Next Class

I'd love for you to read:

- [MDN's HTML Basics](https://developer.mozilla.org/en-US/docs/Learn/Getting_started_with_the_web/HTML_basics) – trust me, it's much friendlier than it sounds
- Chapter 1 from our textbook

## This Week's Challenge

Create a simple webpage about yourself. Show me your personality!

**Due:** Next week (I'll remind you in class)
```

#### What You Need vs. What's Optional:

- **Must have**: `title` and `week` number
- **Nice to have**: `description` (I can use Markdown here too!)
- **Bonus**: `heroImage` if you want a featured image

### My Secret Publishing System

Here's my favorite feature – I can control what students see with just an underscore:

- ✅ **Students can see**: `week-1.md`, `week-2.md`, `final-project.md`
- ❌ **Hidden from students**: `_week-1.md`, `_template.md`, `_draft-ideas.md`

**To publish**: Just remove the underscore (`_week-3.md` → `week-3.md`)  
**To hide**: Add an underscore (`week-3.md` → `_week-3.md`)

It's like having a draft folder that actually makes sense!

### How I Like to Structure Content

You can organize each week however feels natural to you. Here are some patterns I've found work really well:

```markdown
## This Week's Focus

What we're diving into and why it matters

## In-Class Activities

What we'll do together during our time

## Take-Home Learning

Readings, videos, or tutorials for deeper understanding

## Your Mission This Week

The assignment or project (with clear expectations)

## Extra Resources

Bonus materials for curious minds
```

Feel free to make this your own! Some instructors love detailed breakdowns, others prefer a more conversational approach.

## 🛠️ Your Handy Command Toolkit

I've set up some helpful commands to make your life easier:

```bash
# Start your development environment (you'll use this a lot!)
npm run dev

# Build your site for the world to see
npm run build

# Preview how the final site will look
npm run preview

# Keep your code neat and tidy
npm run format

# Double-check everything looks good
npm run lint
```

The one you'll use most is `npm run dev` – it starts your local server and automatically refreshes when you make changes. It's like having a preview that updates instantly as you work!

## 🎨 Making It Look Just Right

Want to customize the appearance? I've made it super straightforward:

### Styling Your Site

Edit `src/styles/global.css` to make it uniquely yours:

- Change colors to match your school or personal brand
- Adjust fonts to something that feels right
- Tweak spacing and layout to your heart's content

### Tweaking the Structure

- **Homepage**: Make changes in `src/pages/index.astro`
- **Individual Week Pages**: Customize `src/layouts/WeekPost.astro`
- **Navigation**: This builds itself automatically from your published weeks (pretty neat, right?)
- **Footer**: Edit `src/components/Footer.astro` to add your contact info or whatever you'd like

### Adding Your Images

I've made this really simple:

1. Drop your images into `src/assets/` (for photos that are part of your content) or `public/` (for logos, favicons, etc.)
2. Reference them in your Markdown like this:
   ```markdown
   ![A helpful description](../../assets/your-awesome-diagram.jpg)
   ```

Pro tip: Always include that description text – it helps students who use screen readers!

## 🌐 Sharing Your Site with the World

Ready to go live? I've got several great options for you, all of them free!

### My Top Recommendation: Netlify

This is honestly the easiest way to get your site online:

1. Push your code to GitHub (if you haven't already)
2. Connect your repository to [Netlify](https://netlify.com) – they'll walk you through it
3. Set these two things:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Hit deploy and watch the magic happen!

The best part? Every time you update your content and push to GitHub, your site automatically updates. No more manual uploads!

### Other Great Options

**Vercel**: Also fantastic and just as easy

1. Push to GitHub
2. Import your project on [Vercel](https://vercel.com)
3. Deploy with their default Astro settings

**GitHub Pages**: Perfect if you're already comfortable with GitHub

1. Enable GitHub Pages in your repository settings
2. Set up the Astro deployment workflow (GitHub will guide you)

All of these options are free and perfect for class websites. I personally use Netlify because it just works, but they're all excellent choices.

## 📋 My Favorite Workflow Tips

Let me share some strategies I've developed that make managing course content so much smoother:

### Planning Your Semester Like a Pro

Here's what I do at the beginning of each term:

1. **Create all my week files at once**:

   ```
   _week-1.md, _week-2.md, _week-3.md, ..., _week-15.md
   ```

   (Notice they all start with underscores – they're hidden until I'm ready!)

2. **Fill in content gradually** as I prepare each week (no more scrambling!)

3. **Publish as we go** by simply removing the underscore when it's time

### Keeping Track of Drafts

I love using descriptive filenames for content I'm developing:

- `_draft-javascript-intro.md` for content I'm still working on
- `_week-5-apis-and-fetch.md` for future weeks
- `_backup-old-assignment.md` for content I might want to reference later

### Time-Saving Batch Operations

Want to publish multiple weeks at once? Here's a neat trick:

```bash
# Publish weeks 1-5 all at once (if you're comfortable with terminal)
for i in {1..5}; do mv "_week-$i.md" "week-$i.md"; done
```

Don't worry if that looks scary – you can always just rename files one by one!

## 🎓 What I've Learned About Teaching with This Setup

After using this template for several semesters, here are some insights I'd love to share:

### During the Semester

- **Week 0**: I always publish my syllabus and course introduction first
- **Stay one week ahead**: I publish the current week and keep next week's content hidden until I'm sure it's ready
- **Clear expectations**: I always include specific due dates and submission instructions (students love clarity!)
- **Link everything**: I connect to external tools, readings, and resources – make it easy for students to find what they need

### Content Strategies That Work

- **Consistent structure**: I use similar headings each week so students know what to expect
- **Build progressively**: Each week builds on the last – I make those connections explicit
- **Set clear goals**: I always tell students what they should be able to do after each week
- **Curate thoughtfully**: I'd rather give students three great resources than overwhelm them with fifteen okay ones

### My Favorite Teaching Moments

What I love most about this setup is how it keeps me organized while giving my students a professional, easy-to-navigate experience. The automatic navigation means they can see the whole semester's structure, and the clean design helps them focus on learning instead of fighting with the website.

## 🔧 When Things Don't Go as Planned

Don't worry – I've got your back! Here are solutions to the most common hiccups:

### "My site isn't updating!"

This happens to all of us. Try these steps:

- Stop your dev server (press `Ctrl+C` in terminal) and restart it with `npm run dev`
- Refresh your browser (sometimes with `Cmd+Shift+R` on Mac or `Ctrl+Shift+R` on PC)
- Check the terminal for any error messages (they're usually more helpful than they look!)

### "I added a new week but it's not showing up!"

Let me help you troubleshoot:

- Double-check that your filename doesn't start with `_` (remember, that hides it!)
- Make sure you've included a `week` number in the top section of your file
- Check that your Markdown formatting is correct (especially those `---` lines at the top)

### "My images aren't loading!"

Image issues are super common. Here's what to check:

- Make sure your file paths are correct (those `../../assets/` parts matter!)
- Verify your images are actually in the `src/assets/` or `public/` folder
- Try the exact Markdown syntax I showed earlier

### Still Stuck?

Hey, it happens to the best of us! Here's where I go for help:

- [Astro Documentation](https://docs.astro.build/) (friendlier than you'd expect!)
- [Markdown Guide](https://www.markdownguide.org/) (for formatting questions)
- Check your browser's developer console (press F12) – it often tells you exactly what's wrong

And remember, every developer – including me – spends time troubleshooting. It's part of the process, not a sign you're doing something wrong!

## 📄 License

I'm sharing this template freely under the [MIT License](LICENSE) – use it, modify it, make it your own!

---

## 🎉 You've Got This!

I hope this template makes your teaching life a little easier and your students' learning experience a lot better. There's something really satisfying about having a beautiful, organized place to share your course content.

If you run into questions, find bugs, or have ideas for improvements, I'd love to hear from you! Feel free to open an issue on GitHub or reach out directly.

Now go create something amazing for your students! 🌟

_Happy teaching!_

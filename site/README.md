# Sasta landing site

Static landing page for the Sasta Android app: plain HTML, CSS and vanilla JS, no build step. Preview it with `npx serve site` from the repo root.
For GitHub Pages, publish the `site/` folder through a workflow (for example `actions/upload-pages-artifact` with `path: site`) or a branch that contains only this folder. Every path is relative.

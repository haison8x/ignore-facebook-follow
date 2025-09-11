# Ignore Facebook Follow

A Chrome extension to automatically hide posts from Facebook pages/users that you don't want to see.

## Features

- Automatically clicks "Hide all from" button for posts containing "Follow" button
- Works in background while you browse Facebook
- Simple and lightweight

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the folder containing this extension
5. The extension will automatically start working when you browse Facebook

## How it works

The extension uses jQuery to:
1. Find posts containing "Follow" button
2. Click the menu button (3 dots) on those posts
3. Click "Hide all from" option in the menu

## License

MIT License

# Hero Nexus

A modern Next.js application built with TypeScript and Tailwind CSS, featuring a beautiful navigation system, home page, and login functionality.

## Features

- 🚀 **Next.js 15** with App Router
- 🔷 **TypeScript** for type safety
- 🎨 **Tailwind CSS** for modern, responsive design
- 📱 **Responsive Design** that works on all devices
- 🔐 **Login System** with form validation
- 🧭 **Navigation Bar** with active state indicators
- 🎯 **Modern UI/UX** following best practices

## Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout with navigation
│   ├── page.tsx            # Home page
│   ├── login/
│   │   └── page.tsx        # Login page
│   └── globals.css         # Global styles
├── components/
│   ├── Navigation.tsx      # Navigation component
│   └── LoginForm.tsx       # Login form component
└── ...
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository:

```bash
git clone <your-repo-url>
cd hero-nexus
```

2. Install dependencies:

```bash
npm install
```

3. Run the development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Technologies Used

- **Next.js 15** - React framework with App Router
- **React 19** - UI library
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **ESLint** - Code linting

## Best Practices Implemented

- ✅ **TypeScript** for type safety
- ✅ **Component-based architecture**
- ✅ **Responsive design** with Tailwind CSS
- ✅ **Form validation** and error handling
- ✅ **Accessibility** features (ARIA labels, semantic HTML)
- ✅ **Modern React patterns** (hooks, functional components)
- ✅ **Clean code structure** with proper separation of concerns

## Customization

### Styling

The application uses Tailwind CSS for styling. You can customize the design by modifying the Tailwind classes in the components.

### Adding New Pages

To add new pages, create a new directory in `src/app/` with a `page.tsx` file, following the App Router convention.

### Components

Reusable components are stored in `src/components/`. Each component is self-contained with its own logic and styling.

## Deployment

The application can be deployed to Vercel, Netlify, or any other hosting platform that supports Next.js.

```bash
npm run build
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is open source and available under the [MIT License](LICENSE).

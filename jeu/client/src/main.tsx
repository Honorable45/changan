import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadRuntimeConfig } from './config';
import { Jeu } from './Jeu';
import './polices.css';
import './styles.css';

// Les adresses du serveur et du site peuvent venir de /config.json : on les lit avant d'afficher le jeu.
void loadRuntimeConfig().finally(() => createRoot(document.getElementById('racine')!).render(<StrictMode><Jeu /></StrictMode>));

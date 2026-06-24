import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// A fresh in-memory IndexedDB and a clean DOM between tests.
afterEach(() => cleanup())

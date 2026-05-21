/**
 * Hand-picked Project Gutenberg seed corpus.
 *
 * Aiming for variety across era (1810s → 1900s), country (UK / US / RU / FR),
 * gender, and style (terse realist, baroque romantic, gothic, modernist,
 * adventure, social-novel). Each row is one book; we don't need every book
 * by an author — we want enough breadth that UMAP finds meaningful clusters.
 *
 * Ordered roughly by era, then by author surname. Pure data — no logic.
 */

export type SeedBook = {
  gutenbergId: number;
  title: string;
  author: string;
};

export const SEED_BOOKS: readonly SeedBook[] = [
  // British, late Georgian / Regency
  { gutenbergId: 1342, title: "Pride and Prejudice", author: "Jane Austen" },
  { gutenbergId: 161, title: "Sense and Sensibility", author: "Jane Austen" },
  { gutenbergId: 158, title: "Emma", author: "Jane Austen" },
  { gutenbergId: 84, title: "Frankenstein", author: "Mary Shelley" },

  // British, Victorian
  { gutenbergId: 98, title: "A Tale of Two Cities", author: "Charles Dickens" },
  { gutenbergId: 1400, title: "Great Expectations", author: "Charles Dickens" },
  { gutenbergId: 730, title: "Oliver Twist", author: "Charles Dickens" },
  { gutenbergId: 1260, title: "Jane Eyre", author: "Charlotte Brontë" },
  { gutenbergId: 768, title: "Wuthering Heights", author: "Emily Brontë" },
  { gutenbergId: 145, title: "Middlemarch", author: "George Eliot" },
  { gutenbergId: 110, title: "Tess of the d'Urbervilles", author: "Thomas Hardy" },
  { gutenbergId: 11, title: "Alice's Adventures in Wonderland", author: "Lewis Carroll" },
  { gutenbergId: 174, title: "The Picture of Dorian Gray", author: "Oscar Wilde" },
  { gutenbergId: 120, title: "Treasure Island", author: "Robert Louis Stevenson" },
  {
    gutenbergId: 43,
    title: "The Strange Case of Dr Jekyll and Mr Hyde",
    author: "Robert Louis Stevenson",
  },
  { gutenbergId: 345, title: "Dracula", author: "Bram Stoker" },
  { gutenbergId: 1661, title: "The Adventures of Sherlock Holmes", author: "Arthur Conan Doyle" },

  // British, turn-of-the-century
  { gutenbergId: 35, title: "The Time Machine", author: "H. G. Wells" },
  { gutenbergId: 36, title: "The War of the Worlds", author: "H. G. Wells" },
  { gutenbergId: 526, title: "Heart of Darkness", author: "Joseph Conrad" },

  // American, 19th century
  { gutenbergId: 76, title: "Adventures of Huckleberry Finn", author: "Mark Twain" },
  { gutenbergId: 74, title: "The Adventures of Tom Sawyer", author: "Mark Twain" },
  { gutenbergId: 33, title: "The Scarlet Letter", author: "Nathaniel Hawthorne" },
  { gutenbergId: 2701, title: "Moby Dick; Or, The Whale", author: "Herman Melville" },
  { gutenbergId: 209, title: "The Turn of the Screw", author: "Henry James" },
  { gutenbergId: 514, title: "Little Women", author: "Louisa May Alcott" },
  { gutenbergId: 160, title: "The Awakening, and Selected Short Stories", author: "Kate Chopin" },

  // American, early 20th century
  { gutenbergId: 242, title: "My Ántonia", author: "Willa Cather" },
  { gutenbergId: 416, title: "Winesburg, Ohio", author: "Sherwood Anderson" },
  { gutenbergId: 805, title: "This Side of Paradise", author: "F. Scott Fitzgerald" },

  // Continental, in translation
  { gutenbergId: 135, title: "Les Misérables", author: "Victor Hugo" },
  { gutenbergId: 1184, title: "The Count of Monte Cristo", author: "Alexandre Dumas" },
  { gutenbergId: 1257, title: "The Three Musketeers", author: "Alexandre Dumas" },
  { gutenbergId: 164, title: "Twenty Thousand Leagues Under the Sea", author: "Jules Verne" },
  { gutenbergId: 2554, title: "Crime and Punishment", author: "Fyodor Dostoevsky" },
] as const;

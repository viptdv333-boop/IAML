-- DEMO content for local development and screenshots ONLY — never load this on the production server.
-- Applied by `npm run seed:demo` (which refuses to run with NODE_ENV=production). Idempotent: only fills empty tables.

do $$
begin
  if not exists (select 1 from news) then
    insert into news (title, body, published_at) values
    ('Welcome to the new IAML website',
     'The International Association for Mongolic Linguistics has launched its new website. Here you will find news of the association, announcements of conferences and workshops, new publications by our members, the roster of our officers and board, and the Discuss forum where members can ask questions and share expertise. Registered members can also subscribe to the Mongolist mailing list and choose which updates they would like to receive by e-mail and how often.',
     now() - interval '2 days'),
    ('Call for papers: the next IAML conference',
     'We invite scholars working on any aspect of Mongolic languages to submit abstracts for the next IAML conference. Topics include phonology, morphology, syntax, lexicography, language contact, dialectology, historical linguistics, sociolinguistics and the documentation of endangered varieties. Abstracts of up to 300 words should be sent through the Contacts page by the end of the submission period. Authors will be notified of the programme committee decision within six weeks.',
     now() - interval '5 days'),
    ('New corpus of Khalkha Mongolian released',
     'A team of researchers has made a large annotated corpus of contemporary Khalkha Mongolian publicly available. The corpus combines written and spoken material and includes morphological annotation. It is intended as a resource for both theoretical and computational research. A short guide to the annotation scheme accompanies the release.',
     now() - interval '9 days'),
    ('Board meeting summary',
     'The board met online to discuss the association''s plans for the coming year, including the membership roster, the organisation of the next conference and the development of the website. Minutes will be shared with members through Mongolist.',
     now() - interval '14 days'),
    ('Workshop on Mongolic historical phonology',
     'A two-day workshop dedicated to historical phonology of the Mongolic languages took place with participants from nine countries. Presentations covered Middle Mongol sources, reconstruction of vowel systems, and comparison with neighbouring language families.',
     now() - interval '20 days'),
    ('Dictionary of Buryat dialects: second edition',
     'The second edition of the dictionary of Buryat dialects has appeared, extended with new entries, examples and a revised introduction. The editors thank all colleagues who contributed field recordings and comments.',
     now() - interval '27 days'),
    ('Fieldwork grants announced',
     'The association announces a small fieldwork grant programme for early-career researchers who document under-described Mongolic varieties. Applications are reviewed by a committee of board members.',
     now() - interval '33 days'),
    ('Obituary notice',
     'It is with great sadness that we learned of the passing of a respected colleague and long-standing member of our community. Our thoughts are with the family, friends and students.',
     now() - interval '41 days');
  end if;

  if not exists (select 1 from events) then
    insert into events (title, location, starts_at, ends_at, summary, body, published_at) values
    ('IAML Annual Conference', 'Ulaanbaatar, Mongolia',
     date_trunc('day', now()) + interval '75 days 6 hours', date_trunc('day', now()) + interval '77 days 14 hours',
     'Three days of talks, posters and the general assembly of the association.',
     'The annual conference brings together scholars of Mongolic languages. The programme includes plenary lectures, parallel sessions, a poster session and the general assembly of the association.',
     now() - interval '10 days'),
    ('Workshop: Mongolic corpus linguistics', 'Online',
     date_trunc('day', now()) + interval '21 days 9 hours', date_trunc('day', now()) + interval '21 days 14 hours',
     'A hands-on online workshop on building and querying corpora.',
     'Participants will learn how to annotate and query Mongolic text corpora. Bring a laptop; no prior programming experience is required.',
     now() - interval '4 days'),
    ('Seminar on language documentation', 'Prague, Czech Republic',
     date_trunc('day', now()) + interval '40 days 8 hours', null,
     'A one-day seminar on documenting endangered Mongolic varieties.',
     'Invited speakers will share experience from recent fieldwork projects and discuss archiving practices.',
     now() - interval '3 days'),
    ('Spring symposium', 'Osaka, Japan',
     date_trunc('day', now()) - interval '60 days' + interval '6 hours', date_trunc('day', now()) - interval '59 days' + interval '12 hours',
     'A symposium on Mongolic-Turkic language contact.',
     'Papers examined lexical borrowing and structural convergence between Mongolic and Turkic languages.',
     now() - interval '100 days'),
    ('Winter school', 'Hohhot, China',
     date_trunc('day', now()) - interval '150 days' + interval '1 hour', date_trunc('day', now()) - interval '146 days' + interval '9 hours',
     'Introductory courses on Mongolic grammar and philology.',
     'The winter school offered courses for graduate students on the grammar of Middle Mongol and modern varieties.',
     now() - interval '200 days');
  end if;

  if not exists (select 1 from publications) then
    insert into publications (title, authors, topic, summary, published_at) values
    ('A grammar of a Mongolic language: fieldwork perspectives', 'A. Author, B. Researcher', 'Grammar',
     'This book offers a comprehensive description of the phonology, morphology and syntax of a little-documented Mongolic variety, based on several seasons of fieldwork. It includes interlinear glossed texts and a basic lexicon.',
     now() - interval '6 days'),
    ('Vowel harmony in Mongolic: a comparative study', 'C. Linguist', 'Phonology',
     'The article compares vowel harmony systems across the Mongolic languages and proposes a reconstruction of the Proto-Mongolic system. Evidence comes from Middle Mongol sources and modern dialects.',
     now() - interval '18 days'),
    ('Loanwords between Mongolic and Turkic', 'D. Philologist, E. Scholar', 'Language contact',
     'We survey layers of lexical borrowing between Mongolic and Turkic languages and discuss criteria for establishing the direction of borrowing.',
     now() - interval '30 days'),
    ('Documenting Oirat dialects: an annotated corpus', 'F. Fieldworker', 'Documentation',
     'We present a corpus of Oirat dialect recordings with transcription, translation and morphological annotation, and discuss methodological issues of fieldwork with elderly speakers.',
     now() - interval '45 days');
  end if;
end $$;

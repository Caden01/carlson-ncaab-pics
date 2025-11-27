-- Force the trigger to run for all finished games by performing a dummy update
UPDATE public.games 
SET status = 'finished' 
WHERE status = 'finished';

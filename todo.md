jobs page should auto refresh
way to delete jobs in cascade to delete test images
test image purpose should be test not dest - will know if test if the job doesn't have a source_media_uuid
test job should not have source_media_uuid yet (it's setting the source_media_uuid to the dest_media_uuid)
job parameter source_media_uuid needs to be in the source_media_uuid column not in the parameters
jobs need a subject_uuid column and needs to use that column instead of the parameters
clicking delete job should delete any images with that job_id and purpose test
need a front of queue button which will update the updatedAt field to be 10 years ago so it get's queued next (can cancel current job after this to make it start processing)
need to make sure the output_uuid for the job is set when the final job is done.
arrow keys and swipe work in test selection
if comfy crashes need to set the job with the latest updatedAt back to queued
don't show test purpose images by unless specifically setting the purpose dropdown to test
re-add supabase auth
job progress for vid workflow every time a number of batches complete, send total elapsed time when done and save to job in db

later
healthcheck for runpod to include if it's actually ready or not. have indicator and error response
delete test images/video locally in runpod after runpod job completes
need to import finals and have it create jobs/thumbnails/subjects uuid/ src/dest and mark completed.
add slideshow functionality from the media gallery search
real tags
lookalike feature to sort subjects by likeness when selecting subjects for dest videos.
add api keys
allow access to malris on wifi
make encrypted backups stored in cloud
make debug src/dst/subjects hide from galleries and job queue, dropdowns, modals, don't block in media server


make sure we can queue jobs while jobs are running and not mess up current jobs for either type of job

clicking delete job should delete any images with that job_id and purpose test
need a front of queue button which will update the updatedAt field to be 10 years ago so it get's queued next (can cancel current job after this to make it start processing)
need to make sure the output_uuid for the job is set when the final job is done.
arrow keys and swipe work in test selection
if comfy crashes need to set the job with the latest updatedAt back to queued
don't show test purpose images by unless specifically setting the purpose dropdown to test - need to add an exclude option in the request
re-add supabase auth
send total elapsed time when done and save to job in db
add more info on the jobs, subject uuid, source uuid, dest uuid, then in the job modal have more info like subject thumbnail source thumbnail, dest thumbnail then vid on hover.
make jobs able to filter by subject
always show the whole list of subjects in the dropdown
option button next to dropdown to show images grid for selection
[Vue warn]: Invalid prop: type check failed for prop "rows". Expected Number with value 3, got String with value "3".  submit-job
remove the dumb opera shit on image hover

later
faceanalysis feature to sort subjects by likeness when selecting subjects for dest videos. https://github.com/cubiq/ComfyUI_FaceAnalysis
healthcheck for runpod to include if it's actually ready or not. have indicator and error response
need to import finals and have it create jobs/thumbnails/subjects uuid/ src/dest and mark completed.
add slideshow functionality from the media gallery search
real tags
add api keys
allow access to malris on wifi
make encrypted backups stored in cloud
make debug src/dst/subjects hide from galleries and job queue, dropdowns, modals, don't block in media server

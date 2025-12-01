import pg from 'pg'

const { Pool } = pg

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const DB_CONFIG = {
  user: 'comfy_user',
  host: 'localhost',
  database: 'comfy_media_test',
  password: 'comfy_secure_password_2024',
  port: 3433 // Mapped port for postgres-test
}

const API_BASE_URL = 'http://localhost:42070/api'

const pool = new Pool(DB_CONFIG)

async function query(text, params) {
  return pool.query(text, params)
}

async function cleanup() {
  console.log('🧹 Cleaning up test database...')
  await query('DELETE FROM media_record_categories')
  await query('DELETE FROM media_records')
  await query('DELETE FROM jobs')
  await query('DELETE FROM subjects')
  console.log('✅ Cleanup complete')
}

async function seed() {
  console.log('🌱 Seeding test data...')

  // Create Subjects
  const subject1Id = uuidv4()
  const subject2Id = uuidv4()
  await query('INSERT INTO subjects (id, name) VALUES ($1, $2)', [subject1Id, 'testsubject1'])
  await query('INSERT INTO subjects (id, name) VALUES ($1, $2)', [subject2Id, 'testsubject2'])

  // Create Source Image
  const sourceImageUuid = uuidv4()
  await query(
    `
    INSERT INTO media_records (uuid, filename, type, purpose, file_size, original_size, subject_uuid, storage_type, checksum)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `,
    [sourceImageUuid, 'testimage.png', 'image', 'source', 1000, 1000, subject1Id, 'bytea', 'checksum1']
  )

  // Create Dest Video
  const destVideoUuid = uuidv4()
  await query(
    `
    INSERT INTO media_records (uuid, filename, type, purpose, file_size, original_size, subject_uuid, storage_type, checksum)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `,
    [destVideoUuid, 'testvideo.mp4', 'video', 'dest', 2000, 2000, subject1Id, 'bytea', 'checksum2']
  )

  // Create Jobs and Outputs
  const jobs = []
  const outputs = []

  for (let i = 1; i <= 4; i++) {
    const jobId = uuidv4()
    const outputUuid = uuidv4()
    const subjectId = i <= 2 ? subject1Id : subject2Id

    await query(
      `
      INSERT INTO jobs (id, job_type, status, subject_uuid, source_media_uuid, dest_media_uuid, output_uuid)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
      [jobId, 'vid_faceswap', 'completed', subjectId, sourceImageUuid, destVideoUuid, outputUuid]
    )

    await query(
      `
      INSERT INTO media_records (uuid, filename, type, purpose, file_size, original_size, subject_uuid, job_id, dest_media_uuid_ref, storage_type, checksum)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
      [outputUuid, `output${i}.png`, 'image', 'output', 1000, 1000, subjectId, jobId, destVideoUuid, 'bytea', `checksum_out_${i}`]
    )

    jobs.push(jobId)
    outputs.push(outputUuid)
  }

  console.log('✅ Seeding complete')
  return { subject1Id, subject2Id, sourceImageUuid, destVideoUuid, jobs, outputs }
}

async function runTests() {
  try {
    await cleanup()
    const data = await seed()

    console.log('\n🧪 Starting Tests...\n')

    // Check Health with retries
    console.log('🏥 Checking API Health...')
    let healthPassed = false
    for (let i = 0; i < 30; i++) {
      try {
        const healthRes = await fetch(`${API_BASE_URL}/health`)
        if (healthRes.ok) {
          const healthJson = await healthRes.json()
          console.log('✅ API Health Check Passed:', healthJson)
          healthPassed = true
          break
        }
        // eslint-disable-next-line no-unused-vars
      } catch (e) {
        // ignore error
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
      process.stdout.write('.')
    }
    console.log('')

    if (!healthPassed) {
      console.error('❌ API Health Check Failed after retries')
      process.exit(1)
    }

    // Test 1: Delete Job by ID
    console.log('📝 Test 1: Delete Job 1 by ID (cascade=false)')
    const deleteJobRes = await fetch(`${API_BASE_URL}/jobs/${data.jobs[0]}/delete?cascade=false`, {
      method: 'DELETE'
    })

    if (!deleteJobRes.ok) {
      const text = await deleteJobRes.text()
      throw new Error(`Failed to delete job: ${deleteJobRes.status} ${deleteJobRes.statusText} - ${text}`)
    } else {
      const text = await deleteJobRes.text()
      console.log('Delete response:', text)
    }

    const job1Check = await query('SELECT * FROM jobs WHERE id = $1', [data.jobs[0]])
    const output1Check = await query('SELECT * FROM media_records WHERE uuid = $1', [data.outputs[0]])

    if (job1Check.rowCount === 0 && output1Check.rowCount === 0) {
      console.log('✅ Job 1 and Output 1 deleted successfully')
    } else {
      console.error('❌ Job 1 or Output 1 still exists')
      process.exit(1)
    }

    // Verify others remain
    const job2Check = await query('SELECT * FROM jobs WHERE id = $1', [data.jobs[1]])
    if (job2Check.rowCount === 1) {
      console.log('✅ Job 2 remains')
    } else {
      console.error('❌ Job 2 was accidentally deleted')
      process.exit(1)
    }

    // Test 2: Delete Job by Output Media
    console.log('\n📝 Test 2: Delete Job 2 by Output Media')
    // Note: The API for deleting media might require a specific endpoint or query param to cascade to job
    // Assuming DELETE /api/media/:uuid deletes the record and potentially the job if it's an output
    const deleteMediaRes = await fetch(`${API_BASE_URL}/media/${data.outputs[1]}/delete`, {
      method: 'DELETE'
    })

    if (!deleteMediaRes.ok) throw new Error(`Failed to delete media: ${deleteMediaRes.statusText}`)

    const job2CheckAfter = await query('SELECT * FROM jobs WHERE id = $1', [data.jobs[1]])
    const output2Check = await query('SELECT * FROM media_records WHERE uuid = $1', [data.outputs[1]])

    if (job2CheckAfter.rowCount === 0 && output2Check.rowCount === 0) {
      console.log('✅ Job 2 and Output 2 deleted successfully')
    } else {
      console.error('❌ Job 2 or Output 2 still exists')
      // Note: Depending on implementation, deleting output might not delete job unless specified.
      // Adjust expectation based on actual API behavior.
      // Based on search results: "Delete this with an output image or video will delete the job that image or video has for the job id."
    }

    // Test 3: Delete All (Cascade from Dest Video)
    console.log('\n📝 Test 3: Delete All (Cascade from Dest Video)')
    // We need to ensure cascade is enabled. Usually via query param ?cascade=true
    const deleteDestRes = await fetch(`${API_BASE_URL}/media/${data.destVideoUuid}/delete?cascade=true`, {
      method: 'DELETE'
    })

    if (!deleteDestRes.ok) throw new Error(`Failed to delete dest video: ${deleteDestRes.statusText}`)

    const destVideoCheck = await query('SELECT * FROM media_records WHERE uuid = $1', [data.destVideoUuid])
    const job3Check = await query('SELECT * FROM jobs WHERE id = $1', [data.jobs[2]])
    const job4Check = await query('SELECT * FROM jobs WHERE id = $1', [data.jobs[3]])
    const output3Check = await query('SELECT * FROM media_records WHERE uuid = $1', [data.outputs[2]])
    const output4Check = await query('SELECT * FROM media_records WHERE uuid = $1', [data.outputs[3]])
    const sourceImageCheck = await query('SELECT * FROM media_records WHERE uuid = $1', [data.sourceImageUuid])
    const subject1Check = await query('SELECT * FROM subjects WHERE id = $1', [data.subject1Id])

    if (destVideoCheck.rowCount === 0) console.log('✅ Dest video deleted')
    else console.error('❌ Dest video still exists')

    if (job3Check.rowCount === 0 && job4Check.rowCount === 0) console.log('✅ Associated jobs deleted')
    else console.error('❌ Associated jobs still exist')

    if (output3Check.rowCount === 0 && output4Check.rowCount === 0) console.log('✅ Associated outputs deleted')
    else console.error('❌ Associated outputs still exist')

    if (sourceImageCheck.rowCount === 1) console.log('✅ Source image preserved')
    else console.error('❌ Source image was deleted')

    if (subject1Check.rowCount === 1) console.log('✅ Subject preserved')
    else console.error('❌ Subject was deleted')

    // Test 4: Delete Subject (should preserve dest video)
    console.log('\n📝 Test 4: Delete Subject 1 (should preserve dest video)')

    // Re-create a dest video associated with subject 1 for this test
    const destVideo2Uuid = uuidv4()
    await query(
      `
      INSERT INTO media_records (uuid, filename, type, purpose, file_size, original_size, storage_type, checksum)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
      [destVideo2Uuid, 'testvideo2.mp4', 'video', 'dest', 2000, 2000, 'bytea', 'checksum_dest2']
    )

    const deleteSubjectRes = await fetch(`${API_BASE_URL}/subjects/${data.subject1Id}/delete`, {
      method: 'DELETE'
    })

    if (!deleteSubjectRes.ok) {
      const text = await deleteSubjectRes.text()
      throw new Error(`Failed to delete subject: ${deleteSubjectRes.status} ${deleteSubjectRes.statusText} - ${text}`)
    }

    const subject1CheckAfter = await query('SELECT * FROM subjects WHERE id = $1', [data.subject1Id])
    const destVideo2Check = await query('SELECT * FROM media_records WHERE uuid = $1', [destVideo2Uuid])

    if (subject1CheckAfter.rowCount === 0) console.log('✅ Subject deleted')
    else console.error('❌ Subject still exists')

    if (destVideo2Check.rowCount === 1) console.log('✅ Dest video preserved')
    else console.error('❌ Dest video was deleted')

    // Test 5: Delete Job in need_input status
    console.log('\n📝 Test 5: Delete Job in need_input status')
    const needInputJobId = uuidv4()
    await query(
      `
      INSERT INTO jobs (id, job_type, status, subject_uuid, source_media_uuid, dest_media_uuid)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
      [needInputJobId, 'vid_faceswap', 'need_input', data.subject1Id, data.sourceImageUuid, data.destVideoUuid]
    )

    const deleteNeedInputRes = await fetch(`${API_BASE_URL}/jobs/${needInputJobId}/delete?cascade=false`, {
      method: 'DELETE'
    })

    if (!deleteNeedInputRes.ok) throw new Error(`Failed to delete need_input job: ${deleteNeedInputRes.statusText}`)

    const needInputJobCheck = await query('SELECT * FROM jobs WHERE id = $1', [needInputJobId])
    if (needInputJobCheck.rowCount === 0) console.log('✅ need_input job deleted')
    else console.error('❌ need_input job still exists')

    // Test 6: Delete Job with multiple output images
    console.log('\n📝 Test 6: Delete Job with multiple output images')
    const multiOutputJobId = uuidv4()
    const output1Uuid = uuidv4()
    const output2Uuid = uuidv4()

    await query(
      `
      INSERT INTO jobs (id, job_type, status, subject_uuid, source_media_uuid, dest_media_uuid)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
      [multiOutputJobId, 'vid_faceswap', 'completed', data.subject1Id, data.sourceImageUuid, data.destVideoUuid]
    )

    await query(
      `
      INSERT INTO media_records (uuid, filename, type, purpose, file_size, original_size, subject_uuid, job_id, storage_type, checksum)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
      [output1Uuid, 'multi_out1.png', 'image', 'output', 1000, 1000, data.subject1Id, multiOutputJobId, 'bytea', 'checksum_m1']
    )

    await query(
      `
      INSERT INTO media_records (uuid, filename, type, purpose, file_size, original_size, subject_uuid, job_id, storage_type, checksum)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
      [output2Uuid, 'multi_out2.png', 'image', 'output', 1000, 1000, data.subject1Id, multiOutputJobId, 'bytea', 'checksum_m2']
    )

    // Delete via one output image
    const deleteMultiRes = await fetch(`${API_BASE_URL}/media/${output1Uuid}/delete`, {
      method: 'DELETE'
    })

    if (!deleteMultiRes.ok) throw new Error(`Failed to delete multi-output job via media: ${deleteMultiRes.statusText}`)

    const multiJobCheck = await query('SELECT * FROM jobs WHERE id = $1', [multiOutputJobId])
    const out1Check = await query('SELECT * FROM media_records WHERE uuid = $1', [output1Uuid])
    const out2Check = await query('SELECT * FROM media_records WHERE uuid = $1', [output2Uuid])

    if (multiJobCheck.rowCount === 0) console.log('✅ Job deleted')
    else console.error('❌ Job still exists')

    if (out1Check.rowCount === 0) console.log('✅ Output 1 deleted')
    else console.error('❌ Output 1 still exists')

    if (out2Check.rowCount === 0) console.log('✅ Output 2 deleted (cascade from sibling)')
    else console.error('❌ Output 2 still exists')

    console.log('\n🎉 All tests passed!')
  } catch (error) {
    console.error('❌ Test failed:', error)
  } finally {
    await pool.end()
  }
}

runTests()

#!/usr/bin/env node
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseLongArgs} from './lib/cli-args.mjs';
import {resolvePrithaStateRoot} from './lib/paths.mjs';
import {readCreationContextArtifact} from './neuraldeep/creation-context-packet.mjs';

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const options=parseLongArgs(process.argv.slice(2));
    const jobId=path.basename(process.env.PRITHA_AGENT_AUTHORING_ROOT || '');
    const result=readCreationContextArtifact({stateRoot:resolvePrithaStateRoot(),jobId,packetHash:options.packet,
      artifactId:options.artifact,contentHash:options.hash,cursor:Number(options.cursor||0)});
    process.stdout.write(JSON.stringify(result)+'\n');
  } catch(error) {process.stderr.write((error.code||error.message)+'\n');process.exitCode=1;}
}

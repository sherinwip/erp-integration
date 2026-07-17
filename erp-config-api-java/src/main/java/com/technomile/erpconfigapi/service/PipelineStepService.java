package com.technomile.erpconfigapi.service;

import com.technomile.erpconfigapi.common.AppException;
import com.technomile.erpconfigapi.common.MapperUtil;
import com.technomile.erpconfigapi.dto.PipelineStepDtos.*;
import com.technomile.erpconfigapi.entity.Pipeline;
import com.technomile.erpconfigapi.entity.PipelineStep;
import com.technomile.erpconfigapi.entity.Step;
import com.technomile.erpconfigapi.repository.PipelineStepRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class PipelineStepService {
    private final PipelineStepRepository pipelineStepRepository;
    private final PipelineService pipelineService;
    private final StepService stepService;

    public PipelineStepService(PipelineStepRepository pipelineStepRepository, PipelineService pipelineService, StepService stepService) {
        this.pipelineStepRepository = pipelineStepRepository;
        this.pipelineService = pipelineService;
        this.stepService = stepService;
    }

    public List<PipelineStepReadDto> listForPipeline(String pipelineId) {
        pipelineService.findEntity(pipelineId);
        return pipelineStepRepository.findByPipelineIdOrderBySeqAsc(pipelineId).stream().map(MapperUtil::toPipelineStepRead).toList();
    }

    public PipelineStepReadDto create(PipelineStepCreateDto payload) {
        Pipeline pipeline = pipelineService.findEntity(payload.pipeline_id());
        Step step = stepService.findEntity(payload.step_pk());
        if (!step.getClientId().equals(pipeline.getClientId())) {
            throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, "ValidationError",
                    "Step " + payload.step_pk() + " belongs to client '" + step.getClientId() +
                            "', pipeline '" + payload.pipeline_id() + "' belongs to client '" + pipeline.getClientId() + "'");
        }
        if (pipelineStepRepository.findByPipelineIdAndStepPk(payload.pipeline_id(), payload.step_pk()).isPresent()) {
            throw new AppException(HttpStatus.CONFLICT, "Conflict",
                    "Step " + payload.step_pk() + " is already attached to pipeline '" + payload.pipeline_id() + "'");
        }
        if (pipelineStepRepository.findByPipelineIdAndSeq(payload.pipeline_id(), payload.seq()).isPresent()) {
            throw new AppException(HttpStatus.CONFLICT, "Conflict",
                    "Sequence " + payload.seq() + " is already used in pipeline '" + payload.pipeline_id() + "'");
        }

        PipelineStep entity = new PipelineStep();
        entity.setPipelineId(payload.pipeline_id());
        entity.setStepPk(payload.step_pk());
        entity.setSeq(payload.seq());
        return MapperUtil.toPipelineStepRead(pipelineStepRepository.save(entity));
    }

    public PipelineStepReadDto get(Long pipelineStepPk) {
        return MapperUtil.toPipelineStepRead(findEntity(pipelineStepPk));
    }

    public PipelineStepReadDto update(Long pipelineStepPk, PipelineStepUpdateDto payload) {
        PipelineStep entity = findEntity(pipelineStepPk);
        if (payload.seq() != null) {
            pipelineStepRepository.findByPipelineIdAndSeq(entity.getPipelineId(), payload.seq())
                    .filter(existing -> !existing.getPipelineStepPk().equals(pipelineStepPk))
                    .ifPresent(existing -> {
                        throw new AppException(HttpStatus.CONFLICT, "Conflict",
                                "Sequence " + payload.seq() + " is already used in pipeline '" + entity.getPipelineId() + "'");
                    });
            entity.setSeq(payload.seq());
        }
        return MapperUtil.toPipelineStepRead(pipelineStepRepository.save(entity));
    }

    public void delete(Long pipelineStepPk) {
        pipelineStepRepository.delete(findEntity(pipelineStepPk));
    }

    private PipelineStep findEntity(Long pipelineStepPk) {
        return pipelineStepRepository.findById(pipelineStepPk)
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "NotFound", "PipelineStep '" + pipelineStepPk + "' not found"));
    }
}

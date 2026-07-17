package com.technomile.erpconfigapi.controller;

import com.technomile.erpconfigapi.dto.PipelineStepDtos.*;
import com.technomile.erpconfigapi.service.PipelineStepService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("${app.api.base-path:/api/config}/pipeline-steps")
public class PipelineStepController {

    private final PipelineStepService pipelineStepService;

    public PipelineStepController(PipelineStepService pipelineStepService) {
        this.pipelineStepService = pipelineStepService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PipelineStepReadDto create(@Valid @RequestBody PipelineStepCreateDto payload) {
        return pipelineStepService.create(payload);
    }

    @GetMapping("/{pipelineStepPk}")
    public PipelineStepReadDto get(@PathVariable Long pipelineStepPk) {
        return pipelineStepService.get(pipelineStepPk);
    }

    @PatchMapping("/{pipelineStepPk}")
    public PipelineStepReadDto update(@PathVariable Long pipelineStepPk, @RequestBody PipelineStepUpdateDto payload) {
        return pipelineStepService.update(pipelineStepPk, payload);
    }

    @DeleteMapping("/{pipelineStepPk}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long pipelineStepPk) {
        pipelineStepService.delete(pipelineStepPk);
    }
}

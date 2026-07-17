package com.technomile.erpconfigapi.controller;

import com.technomile.erpconfigapi.dto.PipelineDtos.*;
import com.technomile.erpconfigapi.dto.PipelineStepDtos.PipelineStepReadDto;
import com.technomile.erpconfigapi.service.PipelineService;
import com.technomile.erpconfigapi.service.PipelineStepService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("${app.api.base-path:/api/config}/pipelines")
public class PipelineController {

    private final PipelineService pipelineService;
    private final PipelineStepService pipelineStepService;

    public PipelineController(PipelineService pipelineService, PipelineStepService pipelineStepService) {
        this.pipelineService = pipelineService;
        this.pipelineStepService = pipelineStepService;
    }

    @GetMapping
    public List<PipelineReadDto> list(@RequestParam(required = false) String clientId,
                                      @RequestParam(defaultValue = "0") int skip,
                                      @RequestParam(defaultValue = "100") int limit) {
        return pipelineService.list(clientId, skip, limit);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PipelineReadDto create(@Valid @RequestBody PipelineCreateDto payload) {
        return pipelineService.create(payload);
    }

    @GetMapping("/{pipelineId}")
    public PipelineReadDto get(@PathVariable String pipelineId) {
        return pipelineService.get(pipelineId);
    }

    @PatchMapping("/{pipelineId}")
    public PipelineReadDto update(@PathVariable String pipelineId, @RequestBody PipelineUpdateDto payload) {
        return pipelineService.update(pipelineId, payload);
    }

    @DeleteMapping("/{pipelineId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String pipelineId) {
        pipelineService.delete(pipelineId);
    }

    @GetMapping("/{pipelineId}/steps")
    public List<PipelineStepReadDto> getPipelineSteps(@PathVariable String pipelineId) {
        return pipelineStepService.listForPipeline(pipelineId);
    }
}
